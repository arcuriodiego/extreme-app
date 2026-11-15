-- =====================================================================
-- Compras desde la app con Mercado Pago (Diego, 15 nov).
--
-- El alumno (o su tutor) elige qué comprar: pack, clase suelta (una fecha),
-- la cuota de profe pendiente o un workshop. La app crea la compra pendiente
-- (con el precio de "otros medios", calculado acá), abre Checkout Pro y, cuando
-- Mercado Pago confirma el pago (aviso al servidor o vuelta del alumno), el
-- servidor la cumple con su clave secreta: registra el cobro (medio mp_checkout)
-- y carga el pack, reserva la clase, paga la cuota o inscribe al workshop.
--
-- Si al confirmarse ya no se puede cumplir (por ejemplo, la clase se llenó),
-- el cobro queda registrado igual y la compra pasa a "a revisar" para que
-- recepción la resuelva (otra fecha o devolución).
-- =====================================================================

-- Llamadas del servidor (clave secreta) al cumplir una compra: actúan en nombre
-- de la academia de esa compra (app.service_academy, sólo dentro de la transacción).
create or replace function public.current_academy_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select academy_id from public.profiles where id = auth.uid()),
    case when public.is_service_call() then nullif(current_setting('app.service_academy', true), '')::uuid end
  );
$$;

-- Llamadas del servidor: actúa en nombre de la academia de la compra.
create or replace function public.require_payments_register()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if public.is_service_call() and nullif(current_setting('app.service_academy', true), '') is not null then
    return current_setting('app.service_academy', true)::uuid;
  end if;
  if v_academy is null or not public.has_permission('payments.register') then
    raise exception 'No tenés permiso para registrar pagos.' using errcode = '42501';
  end if;
  return v_academy;
end;
$$;
revoke all on function public.require_payments_register() from public, anon, authenticated;

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
  v_cash boolean;
  v_expected bigint;
begin
  select * into v_charge from public.charges where id = p_charge_id and academy_id = p_academy for update;
  if not found or v_charge.status = 'void' then
    raise exception 'Ese cargo ya no existe.' using errcode = 'P0002';
  end if;
  if v_charge.paid_cents >= v_charge.total_cents then
    raise exception 'Ese cargo ya está pagado.' using errcode = 'P0002';
  end if;
  -- Mercado Pago sólo lo registra el servidor al confirmarse el pago (fulfill_purchase).
  if p_method not in ('cash', 'transfer', 'qr', 'card_pos', 'other') and not (p_method = 'mp_checkout' and public.is_service_call()) then
    raise exception 'Medio de pago inválido.' using errcode = '22023';
  end if;

  v_cash := p_method = 'cash' and v_charge.cash_amount_cents is not null and v_charge.paid_cents = 0;
  v_expected := case when v_cash then v_charge.cash_amount_cents else v_charge.total_cents - v_charge.paid_cents end;
  if p_amount_cents is not null and p_amount_cents is distinct from v_expected then
    raise exception 'Se cobra el total: no se aceptan pagos parciales.' using errcode = '22023', hint = 'must_pay_full';
  end if;
  if v_cash then
    update public.charges set discount_cents = amount_cents - cash_amount_cents where id = p_charge_id;
  end if;

  insert into public.payments (academy_id, student_id, method, amount_cents, reference)
  values (p_academy, v_charge.student_id, p_method, v_expected, nullif(left(trim(coalesce(p_reference, '')), 80), ''))
  returning id into v_payment;
  insert into public.payment_allocations (academy_id, payment_id, charge_id, amount_cents)
  values (p_academy, v_payment, p_charge_id, v_expected);
  perform public.recalc_charge(p_charge_id);
  return v_payment;
end;
$$;

create table public.purchases (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete restrict,
  kind             text not null check (kind in ('pack', 'single_class', 'membership_charge', 'workshop')),
  plan_id          uuid references public.plans(id) on delete restrict,
  session_id       uuid references public.class_sessions(id) on delete restrict,
  charge_id        uuid references public.charges(id) on delete restrict,
  workshop_id      uuid references public.workshops(id) on delete restrict,
  description      text not null check (char_length(description) between 1 and 200),
  amount_cents     bigint not null check (amount_cents > 0),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'review', 'expired')),
  mp_preference_id text check (char_length(mp_preference_id) <= 200),
  mp_payment_id    text check (char_length(mp_payment_id) <= 64),
  note             text check (char_length(note) <= 500),
  created_by       uuid not null references public.profiles(id) on delete restrict,
  created_at       timestamptz not null default now(),
  approved_at      timestamptz
);
create index purchases_student on public.purchases (student_id, created_at desc);
create unique index purchases_mp_payment on public.purchases (mp_payment_id) where mp_payment_id is not null;

alter table public.purchases enable row level security;
grant select on public.purchases to authenticated, service_role;

create policy "Compras: las propias y las del personal" on public.purchases
  for select to authenticated
  using (
    academy_id = public.current_academy_id()
    and (created_by = auth.uid() or public.is_my_student(student_id)
         or public.has_permission('payments.register') or public.has_permission('finance.view'))
  );

-- Crear la compra (pendiente). El precio lo calcula la base, nunca la app.
create or replace function public.create_purchase(p_kind text, p_student_id uuid, p_ref uuid)
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
    insert into public.purchases (academy_id, student_id, kind, plan_id, description, amount_cents, created_by)
    values (v_academy, p_student_id, 'pack', v_plan.id, v_desc, v_amount, auth.uid()) returning id into v_id;

  elsif p_kind = 'single_class' then
    v_s := public.lock_bookable_session(v_academy, p_ref, p_student_id);   -- valida lugar, fecha y que se pueda reservar suelta
    select * into v_plan from public.plans where academy_id = v_academy and kind = 'single_class' and active order by sort_order limit 1;
    if not found then raise exception 'La clase suelta no está disponible.' using errcode = 'P0002'; end if;
    select pp.cash_cents, pp.other_cents into v_cash, v_amount from public.plan_price_pair_on(v_plan.id, v_today) pp;
    v_desc := left('Clase suelta · ' || to_char(v_s.starts_at at time zone v_tz, 'DD/MM HH24:MI'), 200);
    insert into public.purchases (academy_id, student_id, kind, plan_id, session_id, description, amount_cents, created_by)
    values (v_academy, p_student_id, 'single_class', v_plan.id, v_s.id, v_desc, v_amount, auth.uid()) returning id into v_id;

  elsif p_kind = 'membership_charge' then
    select * into v_charge from public.charges
     where id = p_ref and academy_id = v_academy and student_id = p_student_id and concept = 'membership'
       and status in ('open', 'partially_paid');
    if not found then raise exception 'Esa cuota no está pendiente.' using errcode = 'P0002'; end if;
    v_amount := v_charge.total_cents - v_charge.paid_cents;
    v_desc := left(v_charge.description, 200);
    insert into public.purchases (academy_id, student_id, kind, charge_id, description, amount_cents, created_by)
    values (v_academy, p_student_id, 'membership_charge', v_charge.id, v_desc, v_amount, auth.uid()) returning id into v_id;

  elsif p_kind = 'workshop' then
    select * into v_w from public.workshops where id = p_ref and academy_id = v_academy and status = 'published';
    if not found then raise exception 'Ese workshop no está abierto.' using errcode = 'P0002'; end if;
    if exists (select 1 from public.workshop_registrations where workshop_id = v_w.id and student_id = p_student_id and status = 'confirmed') then
      raise exception 'Ya está inscripto en ese workshop.' using errcode = '23505';
    end if;
    v_amount := public.non_cash_price(v_academy, v_w.price_cents);
    v_desc := left('Workshop · ' || v_w.title, 200);
    insert into public.purchases (academy_id, student_id, kind, workshop_id, description, amount_cents, created_by)
    values (v_academy, p_student_id, 'workshop', v_w.id, v_desc, v_amount, auth.uid()) returning id into v_id;

  else
    raise exception 'Tipo de compra inválido.' using errcode = '22023';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'No hay precio vigente.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_id, 'amount_cents', v_amount, 'description', v_desc);
end;
$$;
revoke all on function public.create_purchase(text, uuid, uuid) from public, anon;
grant execute on function public.create_purchase(text, uuid, uuid) to authenticated;

-- Guardar la preferencia de Checkout Pro (sólo quien creó la compra, mientras está pendiente).
create or replace function public.set_purchase_preference(p_purchase_id uuid, p_preference_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.purchases set mp_preference_id = left(p_preference_id, 200)
  where id = p_purchase_id and created_by = auth.uid() and status = 'pending';
$$;
revoke all on function public.set_purchase_preference(uuid, text) from public, anon;
grant execute on function public.set_purchase_preference(uuid, text) to authenticated;

-- Cumplir la compra cuando Mercado Pago confirma el pago (sólo el servidor).
-- Idempotente: si ya se cumplió, no hace nada.
create or replace function public.fulfill_purchase(p_purchase_id uuid, p_mp_payment_id text, p_amount_cents bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.purchases;
  v_charge uuid;
begin
  if not public.is_service_call() then
    raise exception 'Sólo el servidor confirma pagos.' using errcode = '42501';
  end if;
  select * into v_p from public.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'No encontramos esa compra.' using errcode = 'P0002';
  end if;
  if v_p.status in ('approved', 'review') then
    return v_p.status;
  end if;
  perform set_config('app.service_academy', v_p.academy_id::text, true);

  if p_amount_cents is distinct from v_p.amount_cents then
    update public.purchases
       set status = 'review', mp_payment_id = p_mp_payment_id, approved_at = now(),
           note = format('Mercado Pago cobró %s y la compra era de %s.', p_amount_cents, v_p.amount_cents)
     where id = v_p.id;
    return 'review';
  end if;

  begin
    if v_p.kind = 'pack' then
      perform public.sell_pack(v_p.student_id, v_p.plan_id, 'mp_checkout', 'MP ' || p_mp_payment_id);
    elsif v_p.kind = 'single_class' then
      perform public.book_single_class(v_p.session_id, v_p.student_id, 'mp_checkout', 'MP ' || p_mp_payment_id);
    elsif v_p.kind = 'membership_charge' then
      perform public.record_payment(v_p.academy_id, v_p.charge_id, null, 'mp_checkout', 'MP ' || p_mp_payment_id);
    elsif v_p.kind = 'workshop' then
      perform public.enroll_workshop(v_p.workshop_id, v_p.student_id, 'mp_checkout', 'MP ' || p_mp_payment_id);
    end if;
    update public.purchases set status = 'approved', mp_payment_id = p_mp_payment_id, approved_at = now() where id = v_p.id;
    return 'approved';
  exception when others then
    -- No se pudo cumplir (clase llena, cuota ya pagada…): el cobro queda registrado para que recepción lo resuelva.
    insert into public.charges (academy_id, student_id, concept, due_date, description, amount_cents, cash_amount_cents)
    values (v_p.academy_id, v_p.student_id, 'other', public.academy_today(v_p.academy_id),
            left('Pago por Mercado Pago a revisar · ' || v_p.description, 200), v_p.amount_cents, v_p.amount_cents)
    returning id into v_charge;
    perform public.record_payment(v_p.academy_id, v_charge, null, 'mp_checkout', 'MP ' || p_mp_payment_id);
    update public.purchases
       set status = 'review', mp_payment_id = p_mp_payment_id, approved_at = now(), note = left(sqlerrm, 500)
     where id = v_p.id;
    return 'review';
  end;
end;
$$;
revoke all on function public.fulfill_purchase(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.fulfill_purchase(uuid, text, bigint) to service_role;
