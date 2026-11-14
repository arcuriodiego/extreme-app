-- =====================================================================
-- Dos precios por plan (Diego, 14 nov).
--
-- Cada precio de un plan (cuota, packs, clase individual) puede tener, además
-- del precio en efectivo, su precio con otros medios cargado a mano. Así los
-- precios de enero 2027 quedan exactos aunque la diferencia no sea un % fijo:
--   cuota $59.000 / $64.000 · clase $12.600 / $13.500
--   pack 10 $69.500 / $74.000 · pack 16 $108.000 / $114.000
-- Si no se carga, se calcula como antes (efectivo + recargo de las reglas).
-- Los workshops siguen con el recargo de las reglas.
-- Lo ya emitido o cobrado no cambia: los cargos guardan los dos precios.
-- =====================================================================

alter table public.plan_prices
  add column non_cash_amount_cents bigint
    check (non_cash_amount_cents is null or (non_cash_amount_cents > 0 and non_cash_amount_cents < 100000000000)),
  add constraint plan_prices_non_cash_ge_cash check (non_cash_amount_cents is null or non_cash_amount_cents >= amount_cents);

comment on column public.plan_prices.non_cash_amount_cents is
  'Precio con otros medios (transferencia, QR, tarjeta, app). Null = efectivo + recargo de las reglas.';

-- Los dos precios de un plan en una fecha (el último que empezó a regir hasta ese día).
create or replace function public.plan_price_pair_on(p_plan_id uuid, p_date date)
returns table (cash_cents bigint, other_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  select pp.amount_cents,
         coalesce(pp.non_cash_amount_cents, public.non_cash_price(pp.academy_id, pp.amount_cents))
  from public.plan_prices pp
  where pp.plan_id = p_plan_id and pp.valid_from <= p_date
  order by pp.valid_from desc
  limit 1;
$$;

revoke all on function public.plan_price_pair_on(uuid, date) from public, anon, authenticated;

-- Programar un precio: efectivo y, si se quiere, el de otros medios.
drop function public.set_plan_price(uuid, bigint, date);

create or replace function public.set_plan_price(
  p_plan_id uuid, p_amount_cents bigint, p_valid_from date, p_non_cash_cents bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_today date;
begin
  if v_academy is null or not public.has_permission('settings.manage') then
    raise exception 'No tenés permiso para cambiar precios.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plans where id = p_plan_id and academy_id = v_academy) then
    raise exception 'No encontramos ese plan.' using errcode = 'P0002';
  end if;
  v_today := (now() at time zone (select timezone from public.academies where id = v_academy))::date;
  if p_valid_from < v_today then
    raise exception 'Un precio no puede empezar en una fecha pasada.' using errcode = '22023';
  end if;
  if p_non_cash_cents is not null and p_non_cash_cents < p_amount_cents then
    raise exception 'El precio con otros medios no puede ser menor que el de efectivo.' using errcode = '22023', hint = 'non_cash_lower';
  end if;
  insert into public.plan_prices (academy_id, plan_id, amount_cents, non_cash_amount_cents, valid_from)
  values (v_academy, p_plan_id, p_amount_cents, p_non_cash_cents, p_valid_from)
  on conflict (plan_id, valid_from) do update
    set amount_cents = excluded.amount_cents,
        non_cash_amount_cents = excluded.non_cash_amount_cents,
        created_by = public.current_actor_id();
end;
$$;

revoke all on function public.set_plan_price(uuid, bigint, date, bigint) from public, anon;
grant execute on function public.set_plan_price(uuid, bigint, date, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Las funciones que emiten cargos de planes guardan los dos precios
-- (el disparador charges_cash_price no toca un cargo que ya trae el de efectivo).
-- ---------------------------------------------------------------------

create or replace function public.first_membership_payment(
  p_membership_id uuid, p_amount_cents bigint, p_method text, p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_today date := public.academy_today(v_academy);
  v_m public.memberships;
  v_price bigint;
  v_other bigint;
  v_anchor integer := extract(day from v_today)::integer;
  v_end date;
  v_charge uuid;
begin
  select * into v_m from public.memberships where id = p_membership_id and academy_id = v_academy for update;
  if not found or v_m.status <> 'active' then
    raise exception 'Esa cuota ya no está activa.' using errcode = 'P0002';
  end if;
  if v_m.anchor_day is not null then
    raise exception 'Esa cuota ya tiene su primer pago.' using errcode = 'P0001';
  end if;
  select pp.cash_cents, pp.other_cents into v_price, v_other from public.plan_price_pair_on(v_m.plan_id, v_today) pp;
  if v_price is null then
    raise exception 'El plan no tiene precio vigente.' using errcode = 'P0002';
  end if;

  update public.memberships set anchor_day = v_anchor where id = p_membership_id;
  v_end := public.add_months_anchored(v_today, 1, v_anchor) - 1;
  insert into public.charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents, cash_amount_cents)
  values (v_academy, v_m.student_id, 'membership', v_m.id, v_today, v_end, v_today,
          public.membership_charge_description(v_m.id, v_today, v_end), v_other, v_price)
  returning id into v_charge;

  return public.record_payment(v_academy, v_charge, p_amount_cents, p_method, p_reference);
end;
$$;

create or replace function public.generate_membership_charges(p_academy_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date := public.academy_today(p_academy_id);
  v_horizon date := v_today + coalesce(public.setting(p_academy_id, 'due_reminder_days'), 3);
  v_grace   integer := coalesce(public.setting(p_academy_id, 'grace_days'), 5);
  v_alert   integer := coalesce(public.setting(p_academy_id, 'suspension_alert_days'), 30);
  m         record;
  v_last    date;
  v_start   date;
  v_end     date;
  v_price   bigint;
  v_other   bigint;
  v_n       integer;
  v_total   integer := 0;
begin
  for m in
    select * from public.memberships where academy_id = p_academy_id and status = 'active' and anchor_day is not null
  loop
    continue when exists (
      select 1 from public.charges
      where membership_id = m.id and status in ('open', 'partially_paid')
        and due_date + v_grace + v_alert < v_today
    );
    select max(period_start) into v_last from public.charges where membership_id = m.id;
    continue when v_last is null;
    v_start := public.add_months_anchored(v_last, 1, m.anchor_day);
    while v_start <= v_horizon loop
      v_end := public.add_months_anchored(v_start, 1, m.anchor_day) - 1;
      select pp.cash_cents, pp.other_cents into v_price, v_other from public.plan_price_pair_on(m.plan_id, v_start) pp;
      exit when v_price is null;
      insert into public.charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents, cash_amount_cents)
      values (p_academy_id, m.student_id, 'membership', m.id, v_start, v_end, v_start,
              public.membership_charge_description(m.id, v_start, v_end), v_other, v_price)
      on conflict (membership_id, period_start) do nothing;
      get diagnostics v_n = row_count;
      v_total := v_total + v_n;
      v_start := public.add_months_anchored(v_start, 1, m.anchor_day);
    end loop;
  end loop;

  insert into public.charge_generation_runs (academy_id, ran_on) values (p_academy_id, v_today)
  on conflict (academy_id) do update set ran_on = excluded.ran_on, ran_at = now();
  return v_total;
end;
$$;

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
  v_other bigint;
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
  select pp.cash_cents, pp.other_cents into v_price, v_other from public.plan_price_pair_on(p_plan_id, v_today) pp;
  if v_price is null then
    raise exception 'El pack no tiene precio vigente.' using errcode = 'P0002';
  end if;
  v_until := public.add_months_anchored(v_today, 1, extract(day from v_today)::integer);

  insert into public.charges (academy_id, student_id, concept, due_date, description, amount_cents, cash_amount_cents)
  values (v_academy, p_student_id, 'pack', v_today,
          left(format('%s · %s al %s', v_plan.name, to_char(v_today, 'DD/MM'), to_char(v_until - 1, 'DD/MM')), 200), v_other, v_price)
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
  v_other bigint;
  v_charge uuid;
  v_booking uuid;
  v_today date := public.academy_today(v_academy);
begin
  if not exists (select 1 from public.students where id = p_student_id and academy_id = v_academy) then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  v_s := public.lock_bookable_session(v_academy, p_session_id, p_student_id);
  select * into v_plan from public.plans where academy_id = v_academy and kind = 'single_class' and active order by sort_order limit 1;
  select pp.cash_cents, pp.other_cents into v_price, v_other from public.plan_price_pair_on(v_plan.id, v_today) pp;
  if v_price is null then
    raise exception 'La clase individual no tiene precio vigente.' using errcode = 'P0002';
  end if;
  insert into public.charges (academy_id, student_id, concept, due_date, description, amount_cents, cash_amount_cents)
  values (v_academy, p_student_id, 'single_class', v_today,
          left('Clase individual · ' || to_char(v_s.starts_at at time zone (select timezone from public.academies where id = v_academy), 'DD/MM HH24:MI'), 200),
          v_other, v_price)
  returning id into v_charge;
  perform public.record_payment(v_academy, v_charge, null, p_method, p_reference);
  insert into public.bookings (academy_id, session_id, student_id, pay_kind, charge_id)
  values (v_academy, p_session_id, p_student_id, 'single', v_charge)
  returning id into v_booking;
  return v_booking;
end;
$$;
