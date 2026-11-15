-- =====================================================================
-- Anular un pago deshace lo que compró (Diego, 15 nov):
--   · cuota: queda sin pagar (ya salía de la liquidación del profe);
--   · pack: se cancelan sus reservas futuras y se quitan las clases sin usar
--     (las que ya tomó se dieron: siguen contando para el profe);
--   · clase suelta: se cancela la reserva si la clase todavía no pasó;
--   · workshop: se cancela la inscripción (libera el lugar para la lista de espera).
-- Y si el pago fue por Mercado Pago y se devuelve desde Mercado Pago, la app
-- lo anula sola al recibir el aviso (refund_mp_payment, sólo el servidor).
-- =====================================================================

-- Efectos de dejar un cargo sin pagar (se llama después de recalcular).
create or replace function public.undo_charge_purchase(p_charge_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.charges;
  v_bal record;
  v_left integer;
begin
  select * into v_c from public.charges where id = p_charge_id;
  if not found or v_c.status = 'paid' then
    return;   -- sigue pago (por ejemplo, tenía otro pago): no se toca nada
  end if;
  if v_c.concept = 'pack' then
    for v_bal in select id from public.class_balances where charge_id = p_charge_id loop
      update public.bookings b
         set status = 'cancelled', cancelled_at = now(), refunded_unit = false, cancel_note = left(p_note, 200)
        from public.class_sessions s
       where s.id = b.session_id and b.balance_id = v_bal.id and b.status = 'confirmed' and s.starts_at > now();
      v_left := public.balance_remaining(v_bal.id);
      if v_left > 0 then
        insert into public.class_balance_movements (academy_id, balance_id, units, reason)
        values (v_c.academy_id, v_bal.id, -v_left, 'adjustment');
      end if;
    end loop;
  elsif v_c.concept = 'single_class' then
    update public.bookings b
       set status = 'cancelled', cancelled_at = now(), refunded_unit = false, cancel_note = left(p_note, 200)
      from public.class_sessions s
     where s.id = b.session_id and b.charge_id = p_charge_id and b.status = 'confirmed' and s.starts_at > now();
  elsif v_c.concept = 'workshop' then
    update public.workshop_registrations
       set status = 'cancelled', cancelled_at = now(), cancel_reason = left(p_note, 200)
     where charge_id = p_charge_id and status = 'confirmed';
  end if;
end;
$$;
revoke all on function public.undo_charge_purchase(uuid, text) from public, anon, authenticated;

-- Anular (interno): marca el pago, recalcula y deshace lo comprado.
create or replace function public.void_payment_internal(p_academy uuid, p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge uuid;
begin
  update public.payments
     set status = 'void', void_reason = left(trim(p_reason), 200), voided_by = auth.uid(), voided_at = now()
   where id = p_payment_id and academy_id = p_academy and status = 'approved';
  if not found then
    raise exception 'Ese pago ya estaba anulado o no existe.' using errcode = 'P0002';
  end if;
  for v_charge in select charge_id from public.payment_allocations where payment_id = p_payment_id loop
    perform public.recalc_charge(v_charge);
    perform public.undo_charge_purchase(v_charge, 'Pago anulado: ' || trim(p_reason));
  end loop;
end;
$$;
revoke all on function public.void_payment_internal(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
begin
  if v_academy is null or not public.has_permission('finance.view') then
    raise exception 'Sólo administración puede anular pagos.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Escribí el motivo de la anulación.' using errcode = '22023';
  end if;
  perform public.void_payment_internal(v_academy, p_payment_id, p_reason);
end;
$$;

-- Devolución hecha desde Mercado Pago: el servidor la anula sola (idempotente).
create or replace function public.refund_mp_payment(p_mp_payment_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_n integer := 0;
begin
  if not public.is_service_call() then
    raise exception 'Sólo el servidor registra devoluciones de Mercado Pago.' using errcode = '42501';
  end if;
  for v_p in
    select id, academy_id from public.payments
    where method = 'mp_checkout' and status = 'approved' and reference = 'MP ' || p_mp_payment_id
  loop
    perform public.void_payment_internal(v_p.academy_id, v_p.id, 'Devuelto por Mercado Pago');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.refund_mp_payment(text) from public, anon, authenticated;
grant execute on function public.refund_mp_payment(text) to service_role;
