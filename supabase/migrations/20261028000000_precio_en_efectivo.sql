-- =====================================================================
-- Precio en efectivo (Diego, 28 oct).
--
-- El precio que se carga (cuotas, packs, clase individual, workshops) es el
-- precio EN EFECTIVO. Con cualquier otro medio (transferencia, QR, tarjeta,
-- y la app cuando esté Mercado Pago) se cobra ese precio + un recargo
-- (regla non_cash_surcharge_pct, 21 % al empezar). Los dos incluyen IVA.
--
-- Cada cargo nuevo guarda los dos: amount_cents (otros medios) y
-- cash_amount_cents (efectivo). Al cobrarlo en efectivo, la diferencia queda
-- como descuento del cargo; si ese pago se anula, el descuento se quita.
-- Los cargos anteriores (sin cash_amount_cents) se cobran como siempre.
-- =====================================================================

-- Regla nueva.
alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in (
  'grace_days', 'suspension_alert_days', 'due_reminder_days', 'cancel_hours', 'credit_days',
  'credit_class_window_days', 'booking_hold_minutes', 'session_generation_weeks',
  'checkin_before_minutes', 'checkin_after_minutes', 'workshop_offer_hours',
  'non_cash_surcharge_pct'  -- precios: recargo (%) sobre el precio en efectivo para otros medios de pago
));

create or replace function public.seed_default_settings(p_academy_id uuid)
returns void
language sql
as $$
  insert into public.app_settings (academy_id, key, value) values
    (p_academy_id, 'grace_days', 5),
    (p_academy_id, 'suspension_alert_days', 30),
    (p_academy_id, 'due_reminder_days', 3),
    (p_academy_id, 'cancel_hours', 12),
    (p_academy_id, 'credit_days', 5),
    (p_academy_id, 'credit_class_window_days', 14),
    (p_academy_id, 'booking_hold_minutes', 15),
    (p_academy_id, 'session_generation_weeks', 8),
    (p_academy_id, 'checkin_before_minutes', 30),
    (p_academy_id, 'checkin_after_minutes', 15),
    (p_academy_id, 'workshop_offer_hours', 24),
    (p_academy_id, 'non_cash_surcharge_pct', 21)
  on conflict (academy_id, key) do nothing;
$$;

select public.seed_default_settings(id) from public.academies;

create or replace function public.setting_bounds(p_key text)
returns int4range
language sql
immutable
as $$
  select case p_key
    when 'grace_days'               then int4range(0, 15, '[]')
    when 'suspension_alert_days'    then int4range(7, 120, '[]')
    when 'due_reminder_days'        then int4range(1, 10, '[]')
    when 'cancel_hours'             then int4range(0, 48, '[]')
    when 'credit_days'              then int4range(1, 30, '[]')
    when 'credit_class_window_days' then int4range(1, 60, '[]')
    when 'booking_hold_minutes'     then int4range(5, 60, '[]')
    when 'session_generation_weeks' then int4range(4, 12, '[]')
    when 'checkin_before_minutes'   then int4range(5, 120, '[]')
    when 'checkin_after_minutes'    then int4range(0, 60, '[]')
    when 'workshop_offer_hours'     then int4range(1, 72, '[]')
    when 'non_cash_surcharge_pct'   then int4range(0, 50, '[]')
  end;
$$;

-- Precio con otros medios: efectivo + recargo, redondeado a pesos enteros.
create or replace function public.non_cash_price(p_academy_id uuid, p_cash_cents bigint)
returns bigint
language sql
stable
as $$
  select (round(p_cash_cents * (100 + coalesce(public.setting(p_academy_id, 'non_cash_surcharge_pct'), 0)) / 10000.0) * 100)::bigint;
$$;

-- ---------------------------------------------------------------------
-- Cargos: guardan los dos precios.
-- ---------------------------------------------------------------------
alter table public.charges add column cash_amount_cents bigint check (cash_amount_cents is null or cash_amount_cents > 0);
alter table public.charges add constraint charges_cash_le_amount check (cash_amount_cents is null or cash_amount_cents <= amount_cents);

-- Todas las funciones que emiten cargos insertan el precio cargado (en efectivo):
-- este disparador lo guarda como precio en efectivo y pone el de otros medios.
create or replace function public.charges_apply_cash_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cash_amount_cents is null and new.discount_cents = 0 then
    new.cash_amount_cents := new.amount_cents;
    new.amount_cents := public.non_cash_price(new.academy_id, new.amount_cents);
  end if;
  return new;
end;
$$;

create trigger charges_cash_price before insert on public.charges
  for each row execute function public.charges_apply_cash_price();

-- Lo pagado y el estado; si ya no queda ningún pago, se quita el descuento por efectivo.
create or replace function public.recalc_charge(p_charge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid bigint;
  v_c public.charges;
  v_discount bigint;
begin
  select coalesce(sum(a.amount_cents), 0) into v_paid
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id and p.status = 'approved'
  where a.charge_id = p_charge_id;

  select * into v_c from public.charges where id = p_charge_id;
  v_discount := v_c.discount_cents;
  if v_paid = 0 and v_c.cash_amount_cents is not null and v_discount = v_c.amount_cents - v_c.cash_amount_cents then
    v_discount := 0;
  end if;

  update public.charges
     set discount_cents = v_discount,
         paid_cents = v_paid,
         status = case
           when status = 'void' then 'void'
           when v_paid >= amount_cents - v_discount then 'paid'
           when v_paid > 0 then 'partially_paid'
           else 'open'
         end
   where id = p_charge_id;
end;
$$;

-- Cobra el total de un cargo. En efectivo (y sin pagos previos), el total es el precio en efectivo.
-- p_amount_cents = lo que vio recepción (si cambió, se rechaza); null = lo que corresponda (uso interno).
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
  if p_method not in ('cash', 'transfer', 'qr', 'card_pos', 'other') then
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

-- Las funciones que cobran en el mismo paso piden "lo que corresponda" según el medio.
create or replace function public.sell_pack(p_student_id uuid, p_plan_id uuid, p_method text, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_tz text := (select timezone from public.academies where id = v_academy);
  v_today date := public.academy_today(v_academy);
  v_plan public.plans;
  v_price bigint;
  v_charge uuid;
  v_balance uuid;
  v_until date;
begin
  select * into v_plan from public.plans where id = p_plan_id and academy_id = v_academy and kind = 'pack' and active;
  if not found then
    raise exception 'Ese pack no existe o no está activo.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and academy_id = v_academy) then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  v_price := public.plan_price_on(p_plan_id, v_today);
  if v_price is null then
    raise exception 'El pack no tiene precio vigente.' using errcode = 'P0002';
  end if;
  v_until := public.add_months_anchored(v_today, 1, extract(day from v_today)::integer);

  insert into public.charges (academy_id, student_id, concept, due_date, description, amount_cents)
  values (v_academy, p_student_id, 'pack', v_today,
          left(format('%s · %s al %s', v_plan.name, to_char(v_today, 'DD/MM'), to_char(v_until - 1, 'DD/MM')), 200), v_price)
  returning id into v_charge;
  perform public.record_payment(v_academy, v_charge, null, p_method, p_reference);

  insert into public.class_balances (academy_id, student_id, kind, plan_id, units_total, valid_until, charge_id)
  values (v_academy, p_student_id, 'pack', p_plan_id, v_plan.class_count, (v_until::timestamp) at time zone v_tz, v_charge)
  returning id into v_balance;
  insert into public.class_balance_movements (academy_id, balance_id, units, reason)
  values (v_academy, v_balance, v_plan.class_count, 'purchase');
  return v_balance;
end;
$$;

create or replace function public.book_single_class(p_session_id uuid, p_student_id uuid, p_method text, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_s public.class_sessions;
  v_plan public.plans;
  v_price bigint;
  v_charge uuid;
  v_booking uuid;
  v_today date := public.academy_today(v_academy);
begin
  if not exists (select 1 from public.students where id = p_student_id and academy_id = v_academy) then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  v_s := public.lock_bookable_session(v_academy, p_session_id, p_student_id);
  select * into v_plan from public.plans where academy_id = v_academy and kind = 'single_class' and active order by sort_order limit 1;
  v_price := public.plan_price_on(v_plan.id, v_today);
  if v_price is null then
    raise exception 'La clase individual no tiene precio vigente.' using errcode = 'P0002';
  end if;
  insert into public.charges (academy_id, student_id, concept, due_date, description, amount_cents)
  values (v_academy, p_student_id, 'single_class', v_today,
          left('Clase individual · ' || to_char(v_s.starts_at at time zone (select timezone from public.academies where id = v_academy), 'DD/MM HH24:MI'), 200),
          v_price)
  returning id into v_charge;
  perform public.record_payment(v_academy, v_charge, null, p_method, p_reference);
  insert into public.bookings (academy_id, session_id, student_id, pay_kind, charge_id)
  values (v_academy, p_session_id, p_student_id, 'single', v_charge)
  returning id into v_booking;
  return v_booking;
end;
$$;

create or replace function public.enroll_workshop(
  p_workshop_id uuid, p_student_id uuid, p_method text, p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_reg uuid;
  v_charge public.charges;
begin
  v_reg := public.register_workshop(p_workshop_id, p_student_id);
  select c.* into v_charge from public.charges c
   join public.workshop_registrations r on r.charge_id = c.id
   where r.id = v_reg;
  perform public.record_payment(v_academy, v_charge.id, null, p_method, p_reference);
  return v_reg;
end;
$$;

create or replace function public.enroll_workshop_guest(
  p_workshop_id uuid, p_first_name text, p_last_name text, p_phone text, p_dni text, p_method text, p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_reg uuid;
  v_charge public.charges;
begin
  v_reg := public.register_workshop_guest(p_workshop_id, p_first_name, p_last_name, p_phone, p_dni);
  select c.* into v_charge from public.charges c
   join public.workshop_registrations r on r.charge_id = c.id
   where r.id = v_reg;
  perform public.record_payment(v_academy, v_charge.id, null, p_method, p_reference);
  return v_reg;
end;
$$;

-- El aviso de cuota por vencer muestra también el precio en efectivo.
create or replace function public.generate_notifications(p_academy uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.academy_today(p_academy);
  v_tz    text := (select timezone from public.academies where id = p_academy);
  v_soon  integer := coalesce(public.setting(p_academy, 'due_reminder_days'), 3);
  v_grace integer := coalesce(public.setting(p_academy, 'grace_days'), 5);
  v_total integer := 0;
  r record;
  v_name text;
  v_last date;
begin
  -- Cuotas por vencer.
  for r in
    select c.id, c.student_id, c.due_date, c.total_cents - c.paid_cents as owed,
           case when c.paid_cents = 0 then c.cash_amount_cents end as cash, s.first_name
    from public.charges c
    join public.memberships m on m.id = c.membership_id and m.status = 'active'
    join public.students s on s.id = c.student_id
    where c.academy_id = p_academy and c.concept = 'membership' and c.status in ('open', 'partially_paid')
      and c.due_date between v_today and v_today + v_soon
  loop
    v_total := v_total + public.notify_student(p_academy, r.student_id, 'due_soon',
      'Tu cuota vence el ' || public.short_day(r.due_date),
      'La cuota de ' || r.first_name || ' vence el ' || public.short_day(r.due_date),
      'Son ' || public.ars(r.owed) || case when r.cash is not null and r.cash < r.owed then ', o ' || public.ars(r.cash) || ' en efectivo en recepción.' else '. Podés pagarla en recepción.' end,
      'Son ' || public.ars(r.owed) || case when r.cash is not null and r.cash < r.owed then ', o ' || public.ars(r.cash) || ' en efectivo en recepción.' else '. Se puede pagar en recepción.' end,
      '/pagos', 'vence:' || r.id);
  end loop;

  -- Cuotas en gracia o suspendidas (por el cargo impago más antiguo).
  for r in
    select m.id, m.student_id, s.first_name,
           (select c.id from public.charges c where c.membership_id = m.id and c.status in ('open', 'partially_paid')
              and c.due_date < v_today order by c.due_date limit 1) as charge_id,
           (select min(c.due_date) from public.charges c where c.membership_id = m.id and c.status in ('open', 'partially_paid')
              and c.due_date < v_today) as oldest
    from public.memberships m
    join public.students s on s.id = m.student_id
    where m.academy_id = p_academy and m.status = 'active' and m.anchor_day is not null
  loop
    continue when r.oldest is null;
    v_last := r.oldest + v_grace;
    if v_today <= v_last then
      v_total := v_total + public.notify_student(p_academy, r.student_id, 'grace',
        'Tu cuota venció el ' || public.short_day(r.oldest),
        'La cuota de ' || r.first_name || ' venció el ' || public.short_day(r.oldest),
        'Podés seguir viniendo hasta el ' || public.short_day(v_last) || '. Pagala en recepción para no perder el acceso.',
        'Puede seguir viniendo hasta el ' || public.short_day(v_last) || '. Se puede pagar en recepción.',
        '/pagos', 'gracia:' || r.charge_id);
    else
      v_total := v_total + public.notify_student(p_academy, r.student_id, 'suspended',
        'Tu acceso a las clases está suspendido',
        'El acceso de ' || r.first_name || ' a las clases está suspendido',
        'La cuota venció el ' || public.short_day(r.oldest) || '. Cuando la pagues en recepción, volvés a entrar. Tu lugar fijo se mantiene.',
        'La cuota venció el ' || public.short_day(r.oldest) || '. Al pagarla en recepción vuelve a entrar. Su lugar fijo se mantiene.',
        '/pagos', 'suspendida:' || r.charge_id);
    end if;
  end loop;

  -- Packs por vencer con clases sin usar.
  for r in
    select b.id, b.student_id, s.first_name, ((b.valid_until at time zone v_tz)::date - 1) as last_day,
           public.balance_remaining(b.id) as remaining
    from public.class_balances b
    join public.students s on s.id = b.student_id
    where b.academy_id = p_academy and b.kind = 'pack'
      and b.valid_until > now() and (b.valid_until at time zone v_tz)::date - 1 <= v_today + v_soon
  loop
    continue when r.remaining <= 0;
    v_total := v_total + public.notify_student(p_academy, r.student_id, 'pack_expiring',
      'Tu pack vence el ' || public.short_day(r.last_day),
      'El pack de ' || r.first_name || ' vence el ' || public.short_day(r.last_day),
      'Te quedan ' || r.remaining || case when r.remaining = 1 then ' clase' else ' clases' end || '. Reservalas desde Clases antes de que venza.',
      'Le quedan ' || r.remaining || case when r.remaining = 1 then ' clase' else ' clases' end || '. Se pueden reservar desde Clases.',
      '/clases', 'pack:' || r.id);
  end loop;

  insert into public.notification_runs (academy_id, ran_on) values (p_academy, v_today)
  on conflict (academy_id) do update set ran_on = excluded.ran_on, ran_at = now();
  return v_total;
end;
$$;
