-- =====================================================================
-- "Ya transferí" (Diego, 15 nov): el alumno paga por transferencia (Cuenta DNI,
-- cualquier banco o billetera), sube el comprobante desde Compras y recepción
-- lo confirma con un toque: se registra el cobro (transferencia) y se carga lo
-- comprado (pack, clase suelta, cuota o workshop), igual que con Mercado Pago.
-- Si no entró, recepción la rechaza con el motivo.
--
-- Usa la misma tabla de compras (channel = 'transfer') y el mismo cumplimiento.
-- Comprobantes: bucket privado "comprobantes" (imagen o PDF, hasta 4 MB),
-- ruta <academia>/<compra>/<nombre al azar>.<ext>. Los ve quien la subió y recepción.
-- =====================================================================

alter table public.purchases
  add column channel text not null default 'mp' check (channel in ('mp', 'transfer')),
  add column proof_path text check (proof_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{8,40}\.(jpg|png|webp|pdf)$'),
  add column reject_reason text check (char_length(reject_reason) <= 200),
  add column resolved_by uuid references public.profiles(id) on delete set null;

alter table public.purchases drop constraint purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status in ('pending', 'approved', 'review', 'expired', 'rejected'));

drop function public.create_purchase(text, uuid, uuid);

create or replace function public.create_purchase(p_kind text, p_student_id uuid, p_ref uuid, p_channel text default 'mp')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_today date;
  v_id uuid;
  v_amount bigint;
  v_desc text;
  v_plan public.plans;
  v_charge public.charges;
  v_w public.workshops;
  v_s public.class_sessions;
  v_tz text;
  v_cash bigint;
begin
  if v_academy is null or auth.uid() is null then
    raise exception 'Iniciá sesión.' using errcode = '42501';
  end if;
  if p_channel not in ('mp', 'transfer') then
    raise exception 'Medio de pago inválido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and academy_id = v_academy)
     or not public.can_book_for(p_student_id) then
    raise exception 'No podés comprar para este alumno.' using errcode = '42501';
  end if;
  v_today := public.academy_today(v_academy);
  v_tz := (select timezone from public.academies where id = v_academy);

  if p_kind = 'pack' then
    select * into v_plan from public.plans where id = p_ref and academy_id = v_academy and kind = 'pack' and active;
    if not found then raise exception 'Ese pack no está disponible.' using errcode = 'P0002'; end if;
    select pp.cash_cents, pp.other_cents into v_cash, v_amount from public.plan_price_pair_on(v_plan.id, v_today) pp;
    v_desc := v_plan.name;
    insert into public.purchases (academy_id, channel, student_id, kind, plan_id, description, amount_cents, created_by)
    values (v_academy, p_channel, p_student_id, 'pack', v_plan.id, v_desc, v_amount, auth.uid()) returning id into v_id;

  elsif p_kind = 'single_class' then
    v_s := public.lock_bookable_session(v_academy, p_ref, p_student_id);   -- valida lugar, fecha y que se pueda reservar suelta
    select * into v_plan from public.plans where academy_id = v_academy and kind = 'single_class' and active order by sort_order limit 1;
    if not found then raise exception 'La clase suelta no está disponible.' using errcode = 'P0002'; end if;
    select pp.cash_cents, pp.other_cents into v_cash, v_amount from public.plan_price_pair_on(v_plan.id, v_today) pp;
    v_desc := left('Clase suelta · ' || to_char(v_s.starts_at at time zone v_tz, 'DD/MM HH24:MI'), 200);
    insert into public.purchases (academy_id, channel, student_id, kind, plan_id, session_id, description, amount_cents, created_by)
    values (v_academy, p_channel, p_student_id, 'single_class', v_plan.id, v_s.id, v_desc, v_amount, auth.uid()) returning id into v_id;

  elsif p_kind = 'membership_charge' then
    select * into v_charge from public.charges
     where id = p_ref and academy_id = v_academy and student_id = p_student_id and concept = 'membership'
       and status in ('open', 'partially_paid');
    if not found then raise exception 'Esa cuota no está pendiente.' using errcode = 'P0002'; end if;
    v_amount := v_charge.total_cents - v_charge.paid_cents;
    v_desc := left(v_charge.description, 200);
    insert into public.purchases (academy_id, channel, student_id, kind, charge_id, description, amount_cents, created_by)
    values (v_academy, p_channel, p_student_id, 'membership_charge', v_charge.id, v_desc, v_amount, auth.uid()) returning id into v_id;

  elsif p_kind = 'workshop' then
    select * into v_w from public.workshops where id = p_ref and academy_id = v_academy and status = 'published';
    if not found then raise exception 'Ese workshop no está abierto.' using errcode = 'P0002'; end if;
    if exists (select 1 from public.workshop_registrations where workshop_id = v_w.id and student_id = p_student_id and status = 'confirmed') then
      raise exception 'Ya está inscripto en ese workshop.' using errcode = '23505';
    end if;
    v_amount := public.non_cash_price(v_academy, v_w.price_cents);
    v_desc := left('Workshop · ' || v_w.title, 200);
    insert into public.purchases (academy_id, channel, student_id, kind, workshop_id, description, amount_cents, created_by)
    values (v_academy, p_channel, p_student_id, 'workshop', v_w.id, v_desc, v_amount, auth.uid()) returning id into v_id;

  else
    raise exception 'Tipo de compra inválido.' using errcode = '22023';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'No hay precio vigente.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_id, 'amount_cents', v_amount, 'description', v_desc);
end;
$$;
revoke all on function public.create_purchase(text, uuid, uuid, text) from public, anon;
grant execute on function public.create_purchase(text, uuid, uuid, text) to authenticated;

-- Cumplir una compra (interno): Mercado Pago o transferencia confirmada.
create or replace function public.fulfill_purchase_internal(p_purchase_id uuid, p_method text, p_reference text, p_amount_cents bigint, p_mp_payment_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.purchases;
  v_charge uuid;
begin
  select * into v_p from public.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'No encontramos esa compra.' using errcode = 'P0002';
  end if;
  if v_p.status in ('approved', 'review') then
    return v_p.status;
  end if;
  if v_p.status <> 'pending' then
    raise exception 'Esa compra ya no está pendiente.' using errcode = 'P0001';
  end if;
  perform set_config('app.service_academy', v_p.academy_id::text, true);

  if p_amount_cents is distinct from v_p.amount_cents then
    update public.purchases
       set status = 'review', mp_payment_id = p_mp_payment_id, approved_at = now(), resolved_by = auth.uid(),
           note = format('Se cobró %s y la compra era de %s.', p_amount_cents, v_p.amount_cents)
     where id = v_p.id;
    return 'review';
  end if;

  begin
    if v_p.kind = 'pack' then
      perform public.sell_pack(v_p.student_id, v_p.plan_id, p_method, p_reference);
    elsif v_p.kind = 'single_class' then
      perform public.book_single_class(v_p.session_id, v_p.student_id, p_method, p_reference);
    elsif v_p.kind = 'membership_charge' then
      perform public.record_payment(v_p.academy_id, v_p.charge_id, null, p_method, p_reference);
    elsif v_p.kind = 'workshop' then
      perform public.enroll_workshop(v_p.workshop_id, v_p.student_id, p_method, p_reference);
    end if;
    update public.purchases set status = 'approved', mp_payment_id = p_mp_payment_id, approved_at = now(), resolved_by = auth.uid()
     where id = v_p.id;
    return 'approved';
  exception when others then
    -- No se pudo cumplir (clase llena, cuota ya pagada…): el cobro queda registrado para resolverlo.
    insert into public.charges (academy_id, student_id, concept, due_date, description, amount_cents, cash_amount_cents)
    values (v_p.academy_id, v_p.student_id, 'other', public.academy_today(v_p.academy_id),
            left('Pago a revisar · ' || v_p.description, 200), v_p.amount_cents, v_p.amount_cents)
    returning id into v_charge;
    perform public.record_payment(v_p.academy_id, v_charge, null, p_method, p_reference);
    update public.purchases
       set status = 'review', mp_payment_id = p_mp_payment_id, approved_at = now(), resolved_by = auth.uid(), note = left(sqlerrm, 500)
     where id = v_p.id;
    return 'review';
  end;
end;
$$;
revoke all on function public.fulfill_purchase_internal(uuid, text, text, bigint, text) from public, anon, authenticated;

-- Mercado Pago (servidor).
create or replace function public.fulfill_purchase(p_purchase_id uuid, p_mp_payment_id text, p_amount_cents bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_service_call() then
    raise exception 'Sólo el servidor confirma pagos.' using errcode = '42501';
  end if;
  if (select channel from public.purchases where id = p_purchase_id) is distinct from 'mp' then
    raise exception 'Esa compra no es de Mercado Pago.' using errcode = '22023';
  end if;
  return public.fulfill_purchase_internal(p_purchase_id, 'mp_checkout', 'MP ' || p_mp_payment_id, p_amount_cents, p_mp_payment_id);
end;
$$;

-- El alumno adjunta el comprobante (mientras está pendiente).
create or replace function public.set_transfer_proof(p_purchase_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.purchases set proof_path = p_path
   where id = p_purchase_id and created_by = auth.uid() and status = 'pending' and channel = 'transfer'
     and split_part(p_path, '/', 1) = academy_id::text and split_part(p_path, '/', 2) = id::text;
  if not found then
    raise exception 'No podés adjuntar el comprobante a esa compra.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.set_transfer_proof(uuid, text) from public, anon;
grant execute on function public.set_transfer_proof(uuid, text) to authenticated;

-- Recepción confirma que entró la transferencia.
create or replace function public.confirm_transfer_purchase(p_purchase_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_p public.purchases;
begin
  select * into v_p from public.purchases where id = p_purchase_id and academy_id = v_academy and channel = 'transfer';
  if not found then
    raise exception 'No encontramos esa transferencia.' using errcode = 'P0002';
  end if;
  return public.fulfill_purchase_internal(p_purchase_id, 'transfer', 'Transferencia (desde la app)', v_p.amount_cents, null);
end;
$$;
revoke all on function public.confirm_transfer_purchase(uuid) from public, anon;
grant execute on function public.confirm_transfer_purchase(uuid) to authenticated;

-- Recepción la rechaza (no entró, monto distinto…).
create or replace function public.reject_transfer_purchase(p_purchase_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Escribí el motivo.' using errcode = '22023';
  end if;
  update public.purchases
     set status = 'rejected', reject_reason = left(trim(p_reason), 200), resolved_by = auth.uid(), approved_at = now()
   where id = p_purchase_id and academy_id = v_academy and channel = 'transfer' and status = 'pending';
  if not found then
    raise exception 'Esa transferencia ya no está pendiente.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.reject_transfer_purchase(uuid, text) from public, anon;
grant execute on function public.reject_transfer_purchase(uuid, text) to authenticated;

-- Comprobantes (privados).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Comprobantes: subir el propio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and exists (select 1 from public.purchases p
                where p.id = public.folder_uuid(name, 2) and p.created_by = auth.uid()
                  and p.status = 'pending' and p.channel = 'transfer')
  );

create policy "Comprobantes: ver" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and (public.has_permission('payments.register')
         or exists (select 1 from public.purchases p where p.id = public.folder_uuid(name, 2) and p.created_by = auth.uid()))
  );
