-- =====================================================================
-- Migración 0014 · Packs y reservas
-- Saldos de clases (packs y créditos) con libro de movimientos, reservas de
-- clases con cupo real (fijos + reservas), clase individual cobrada en
-- recepción, cancelación con 12 h y créditos de 5 días (clase dentro de 14).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Saldos de clases
-- ---------------------------------------------------------------------

create table public.class_balances (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid not null references public.academies(id) on delete restrict,
  student_id          uuid not null,
  kind                text not null check (kind in ('pack', 'credit')),
  plan_id             uuid,
  units_total         integer not null check (units_total between 1 and 100),
  valid_until         timestamptz not null,     -- hasta cuándo se puede usar (exclusivo)
  class_window_until  timestamptz,              -- crédito: la clase tiene que empezar antes de esto
  charge_id           uuid,
  origin_booking_id   uuid,
  created_by          uuid default public.current_actor_id(),
  created_at          timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict,
  foreign key (academy_id, plan_id) references public.plans (academy_id, id) on delete restrict,
  foreign key (academy_id, charge_id) references public.charges (academy_id, id) on delete restrict
);

create index class_balances_student_idx on public.class_balances (student_id, valid_until);

create table public.class_balance_movements (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete restrict,
  balance_id  uuid not null,
  units       integer not null check (units <> 0),
  reason      text not null check (reason in ('purchase', 'booking', 'cancellation', 'adjustment')),
  booking_id  uuid,
  created_by  uuid default public.current_actor_id(),
  created_at  timestamptz not null default now(),
  foreign key (academy_id, balance_id) references public.class_balances (academy_id, id) on delete restrict
);

create index class_balance_movements_balance_idx on public.class_balance_movements (balance_id);

create or replace function public.balance_remaining(p_balance_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(units), 0)::integer from public.class_balance_movements where balance_id = p_balance_id;
$$;

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------

create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.academies(id) on delete restrict,
  session_id      uuid not null,
  student_id      uuid not null,
  pay_kind        text not null check (pay_kind in ('pack', 'credit', 'single')),
  balance_id      uuid,
  charge_id       uuid,
  status          text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancelled_at    timestamptz,
  refunded_unit   boolean not null default false,
  cancel_note     text check (length(cancel_note) <= 200),
  created_by      uuid default public.current_actor_id(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (academy_id, id),
  check (pay_kind = 'single' or balance_id is not null),
  check (pay_kind <> 'single' or charge_id is not null),
  -- Una clase con reservas no se puede borrar: primero se cancelan las reservas.
  foreign key (academy_id, session_id) references public.class_sessions (academy_id, id) on delete restrict,
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict,
  foreign key (academy_id, balance_id) references public.class_balances (academy_id, id) on delete restrict,
  foreign key (academy_id, charge_id) references public.charges (academy_id, id) on delete restrict
);

create unique index bookings_active_key on public.bookings (session_id, student_id) where status = 'confirmed';
create index bookings_student_idx on public.bookings (student_id, status);

alter table public.class_balance_movements
  add constraint class_balance_movements_booking_fkey foreign key (academy_id, booking_id) references public.bookings (academy_id, id) on delete restrict;
alter table public.class_balances
  add constraint class_balances_origin_booking_fkey foreign key (academy_id, origin_booking_id) references public.bookings (academy_id, id) on delete restrict;

-- ---------------------------------------------------------------------
-- Cupo
-- ---------------------------------------------------------------------

-- Lugares de cada clase: cupo, alumnos fijos ese día y reservas confirmadas.
create or replace function public.session_availability(p_session_ids uuid[])
returns table (session_id uuid, capacity integer, fixed integer, booked integer, seats_left integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.id,
         s.capacity,
         f.fixed,
         b.booked,
         greatest(0, s.capacity - f.fixed - b.booked)
  from public.class_sessions s
  join public.academies a on a.id = s.academy_id
  cross join lateral (
    select count(*)::integer as fixed from public.enrollments e
    where s.schedule_id is not null and e.schedule_id = s.schedule_id
      and e.starts_on <= (s.starts_at at time zone a.timezone)::date
      and (e.ends_on is null or e.ends_on > (s.starts_at at time zone a.timezone)::date)
  ) f
  cross join lateral (
    select count(*)::integer as booked from public.bookings bk where bk.session_id = s.id and bk.status = 'confirmed'
  ) b
  where s.id = any (p_session_ids) and s.academy_id = public.current_academy_id();
$$;

-- ---------------------------------------------------------------------
-- Reservar (uso interno): valida la clase y el cupo con la clase bloqueada.
-- ---------------------------------------------------------------------

create or replace function public.lock_bookable_session(p_academy uuid, p_session_id uuid, p_student_id uuid)
returns public.class_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.class_sessions;
  v_left integer;
begin
  select * into v_s from public.class_sessions where id = p_session_id and academy_id = p_academy for update;
  if not found then
    raise exception 'No encontramos esa clase.' using errcode = 'P0002';
  end if;
  if v_s.status <> 'scheduled' then
    raise exception 'Esa clase está suspendida.' using errcode = 'P0001';
  end if;
  if v_s.starts_at <= now() then
    raise exception 'Esa clase ya empezó.' using errcode = 'P0001';
  end if;
  if not (select allows_single_booking from public.class_groups where id = v_s.group_id) then
    raise exception 'Esa clase es sólo para alumnos con cuota de profe.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bookings where session_id = p_session_id and student_id = p_student_id and status = 'confirmed') then
    raise exception 'Ya tenés reservada esa clase.' using errcode = '23505';
  end if;
  select a.seats_left into v_left from public.session_availability(array[p_session_id]) a;
  if exists (
    select 1 from public.enrollments e join public.academies ac on ac.id = p_academy
    where e.student_id = p_student_id and e.schedule_id = v_s.schedule_id
      and e.starts_on <= (v_s.starts_at at time zone ac.timezone)::date
      and (e.ends_on is null or e.ends_on > (v_s.starts_at at time zone ac.timezone)::date)
  ) then
    raise exception 'Esa clase ya es tu clase fija.' using errcode = '23505';
  end if;
  if coalesce(v_left, 0) <= 0 then
    raise exception 'No hay lugar: la clase está completa.' using errcode = 'P0001';
  end if;
  return v_s;
end;
$$;

-- El alumno para quien se reserva: el propio (si p_student_id es nulo) o, para
-- recepción, cualquiera de la academia.
create or replace function public.resolve_booking_student(p_academy uuid, p_student_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_student_id is null then
    select id into v_id from public.students where academy_id = p_academy and profile_id = auth.uid();
    if v_id is null then
      raise exception 'Tu cuenta no tiene ficha de alumno.' using errcode = 'P0002';
    end if;
    return v_id;
  end if;
  select id into v_id from public.students where id = p_student_id and academy_id = p_academy;
  if v_id is null then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.students where id = v_id and profile_id = auth.uid())
     and not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para reservar por otra persona.' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

-- Reserva con un saldo: primero créditos, después el pack que vence antes.
create or replace function public.book_session(p_session_id uuid, p_student_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_student uuid;
  v_s public.class_sessions;
  v_balance public.class_balances;
  v_booking uuid;
begin
  if v_academy is null then
    raise exception 'Sesión inválida.' using errcode = '42501';
  end if;
  v_student := public.resolve_booking_student(v_academy, p_student_id);
  v_s := public.lock_bookable_session(v_academy, p_session_id, v_student);

  select b.* into v_balance
  from public.class_balances b
  where b.student_id = v_student
    and b.valid_until > now()
    and (b.kind = 'credit' or v_s.starts_at < b.valid_until)
    and (b.class_window_until is null or v_s.starts_at <= b.class_window_until)
    and public.balance_remaining(b.id) > 0
  order by (b.kind = 'credit') desc, b.valid_until
  limit 1
  for update;
  if not found then
    raise exception 'No tenés clases disponibles: comprá un pack o una clase en recepción.' using errcode = 'P0001';
  end if;

  insert into public.bookings (academy_id, session_id, student_id, pay_kind, balance_id)
  values (v_academy, p_session_id, v_student, v_balance.kind, v_balance.id)
  returning id into v_booking;
  insert into public.class_balance_movements (academy_id, balance_id, units, reason, booking_id)
  values (v_academy, v_balance.id, -1, 'booking', v_booking);
  return v_booking;
end;
$$;

-- Clase individual en recepción: cobra el precio vigente y reserva, todo junto.
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
  perform public.record_payment(v_academy, v_charge, v_price, p_method, p_reference);
  insert into public.bookings (academy_id, session_id, student_id, pay_kind, charge_id)
  values (v_academy, p_session_id, p_student_id, 'single', v_charge)
  returning id into v_booking;
  return v_booking;
end;
$$;

-- Venta de pack en recepción: pago total, saldo por 1 mes desde hoy.
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
  perform public.record_payment(v_academy, v_charge, v_price, p_method, p_reference);

  insert into public.class_balances (academy_id, student_id, kind, plan_id, units_total, valid_until, charge_id)
  values (v_academy, p_student_id, 'pack', p_plan_id, v_plan.class_count, (v_until::timestamp) at time zone v_tz, v_charge)
  returning id into v_balance;
  insert into public.class_balance_movements (academy_id, balance_id, units, reason)
  values (v_academy, v_balance, v_plan.class_count, 'purchase');
  return v_balance;
end;
$$;

-- Devuelve la clase de una reserva: al pack (con su vencimiento) o como crédito nuevo.
create or replace function public.refund_booking_unit(p_booking public.bookings, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := coalesce(public.setting(p_booking.academy_id, 'credit_days'), 5);
  v_window integer := coalesce(public.setting(p_booking.academy_id, 'credit_class_window_days'), 14);
  v_credit uuid;
begin
  if p_booking.pay_kind = 'pack' then
    insert into public.class_balance_movements (academy_id, balance_id, units, reason, booking_id)
    values (p_booking.academy_id, p_booking.balance_id, 1, 'cancellation', p_booking.id);
  else
    insert into public.class_balances (academy_id, student_id, kind, units_total, valid_until, class_window_until, origin_booking_id)
    values (p_booking.academy_id, p_booking.student_id, 'credit', 1,
            now() + make_interval(days => v_days), now() + make_interval(days => v_window), p_booking.id)
    returning id into v_credit;
    insert into public.class_balance_movements (academy_id, balance_id, units, reason, booking_id)
    values (p_booking.academy_id, v_credit, 1, 'purchase', p_booking.id);
  end if;
  update public.bookings
     set status = 'cancelled', cancelled_at = now(), refunded_unit = true, cancel_note = left(p_note, 200)
   where id = p_booking.id;
end;
$$;

-- Cancelar una reserva (el propio alumno o recepción). Con 12 h o más antes,
-- devuelve la clase; con menos, no.
create or replace function public.cancel_booking(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_b public.bookings;
  v_start timestamptz;
  v_hours integer;
begin
  select * into v_b from public.bookings where id = p_booking_id and academy_id = v_academy and status = 'confirmed' for update;
  if not found then
    raise exception 'Esa reserva ya estaba cancelada.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.students where id = v_b.student_id and profile_id = auth.uid())
     and not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para cancelar esa reserva.' using errcode = '42501';
  end if;
  select starts_at into v_start from public.class_sessions where id = v_b.session_id;
  if v_start <= now() then
    raise exception 'Esa clase ya empezó.' using errcode = 'P0001';
  end if;
  v_hours := coalesce(public.setting(v_academy, 'cancel_hours'), 12);
  if now() <= v_start - make_interval(hours => v_hours) then
    perform public.refund_booking_unit(v_b, 'Cancelada a tiempo');
    return true;
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancel_note = 'Cancelada con menos de 12 h'
   where id = p_booking_id;
  return false;
end;
$$;

-- Si la academia suspende una clase (o cae en feriado), todas sus reservas
-- se cancelan devolviendo la clase, sin importar la anticipación.
create or replace function public.refund_bookings_of_cancelled_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare b public.bookings;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for b in select * from public.bookings where session_id = new.id and status = 'confirmed' loop
      perform public.refund_booking_unit(b, 'Clase suspendida por la academia');
    end loop;
  end if;
  return null;
end;
$$;

create trigger class_sessions_refund_bookings after update of status on public.class_sessions
  for each row execute function public.refund_bookings_of_cancelled_session();

-- ---------------------------------------------------------------------
-- Fecha de actualización, auditoría y seguridad
-- ---------------------------------------------------------------------

create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();
create trigger class_balances_audit after insert or update or delete on public.class_balances for each row execute function public.write_audit_log();
create trigger class_balance_movements_audit after insert or update or delete on public.class_balance_movements for each row execute function public.write_audit_log();
create trigger bookings_audit after insert or update or delete on public.bookings for each row execute function public.write_audit_log();

alter table public.class_balances          enable row level security;
alter table public.class_balance_movements enable row level security;
alter table public.bookings                enable row level security;

revoke all on public.class_balances, public.class_balance_movements, public.bookings from anon, authenticated;
grant select on public.class_balances, public.class_balance_movements, public.bookings to authenticated;

create policy "Mis saldos, o todos si veo personas" on public.class_balances
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    or (academy_id = public.current_academy_id() and public.has_permission('people.view'))
  );
create policy "Movimientos visibles con su saldo" on public.class_balance_movements
  for select to authenticated
  using (exists (select 1 from public.class_balances b where b.id = balance_id));
create policy "Mis reservas, o todas si veo personas o listas" on public.bookings
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    or (academy_id = public.current_academy_id()
        and (public.has_permission('people.view') or public.has_permission('classes.view_roster')))
  );

-- Internas
revoke all on function public.lock_bookable_session(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.resolve_booking_student(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refund_booking_unit(public.bookings, text) from public, anon, authenticated;
revoke all on function public.refund_bookings_of_cancelled_session() from public, anon, authenticated;
-- Para la app
revoke all on function public.balance_remaining(uuid) from public, anon;
revoke all on function public.session_availability(uuid[]) from public, anon;
revoke all on function public.book_session(uuid, uuid) from public, anon;
revoke all on function public.book_single_class(uuid, uuid, text, text) from public, anon;
revoke all on function public.sell_pack(uuid, uuid, text, text) from public, anon;
revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.balance_remaining(uuid) to authenticated;
grant execute on function public.session_availability(uuid[]) to authenticated;
grant execute on function public.book_session(uuid, uuid) to authenticated;
grant execute on function public.book_single_class(uuid, uuid, text, text) to authenticated;
grant execute on function public.sell_pack(uuid, uuid, text, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
