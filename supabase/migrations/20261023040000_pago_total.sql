-- Todo se cobra completo (Diego, 23 oct): cuotas, packs, workshops y clases sueltas.
-- No hay pagos parciales: cada pago cubre exactamente lo que se debe de ese cargo.
-- Los cargos que ya quedaron con pago parcial (datos de prueba) se cierran pagando el resto.

create or replace function public.record_payment(
  p_academy uuid, p_charge_id uuid, p_amount_cents bigint, p_method text, p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.charges;
  v_payment uuid;
begin
  select * into v_charge from public.charges where id = p_charge_id and academy_id = p_academy for update;
  if not found or v_charge.status = 'void' then
    raise exception 'Ese cargo ya no existe.' using errcode = 'P0002';
  end if;
  if v_charge.paid_cents >= v_charge.total_cents then
    raise exception 'Ese cargo ya está pagado.' using errcode = 'P0002';
  end if;
  if p_method not in ('cash', 'transfer', 'qr', 'card_pos', 'other') then
    raise exception 'Medio de pago inválido.' using errcode = '22023';
  end if;
  if p_amount_cents is distinct from v_charge.total_cents - v_charge.paid_cents then
    raise exception 'Se cobra el total: no se aceptan pagos parciales.' using errcode = '22023', hint = 'must_pay_full';
  end if;

  insert into public.payments (academy_id, student_id, method, amount_cents, reference)
  values (p_academy, v_charge.student_id, p_method, p_amount_cents, nullif(left(trim(coalesce(p_reference, '')), 80), ''))
  returning id into v_payment;
  insert into public.payment_allocations (academy_id, payment_id, charge_id, amount_cents)
  values (p_academy, v_payment, p_charge_id, p_amount_cents);
  perform public.recalc_charge(p_charge_id);
  return v_payment;
end;
$$;

comment on function public.pay_charge(uuid, bigint, text, text) is 'Cobra el total pendiente de un cargo.';
comment on function public.first_membership_payment(uuid, bigint, text, text) is 'Primer pago (total) de una cuota de profe.';
