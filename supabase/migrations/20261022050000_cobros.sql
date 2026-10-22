-- =====================================================================
-- Migración 0010 · Cobros en recepción
-- Cargos (lo que se debe), pagos (lo que entra, de cualquier medio) e
-- imputaciones (qué parte de cada pago cubre qué cargo).
-- Cuota de profe: el primer pago fija el día de vencimiento; los cargos de
-- los meses siguientes se generan solos, unos días antes de vencer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades de fechas
-- ---------------------------------------------------------------------

-- Suma meses manteniendo el día ancla: si el mes no tiene ese día,
-- usa el último (vence 31 → 30 de abril → 31 de mayo).
create or replace function public.add_months_anchored(p_date date, p_months integer, p_anchor integer)
returns date
language sql
immutable
as $$
  select (m + (least(p_anchor, extract(day from (m + interval '1 month' - interval '1 day'))::integer) - 1))::date
  from (select (date_trunc('month', p_date) + make_interval(months => p_months))::date as m) t;
$$;

create or replace function public.academy_today(p_academy_id uuid)
returns date
language sql
stable
as $$
  select (now() at time zone (select timezone from public.academies where id = p_academy_id))::date;
$$;

-- ---------------------------------------------------------------------
-- Cargos
-- ---------------------------------------------------------------------

create table public.charges (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.academies(id) on delete restrict,
  student_id      uuid not null,
  concept         text not null check (concept in ('membership', 'pack', 'single_class', 'workshop', 'other')),
  membership_id   uuid,
  period_start    date,
  period_end      date,
  due_date        date not null,
  description     text not null check (length(description) between 1 and 200),
  amount_cents    bigint not null check (amount_cents > 0),   -- precio de lista al emitir
  discount_cents  bigint not null default 0 check (discount_cents >= 0),
  total_cents     bigint generated always as (amount_cents - discount_cents) stored,
  paid_cents      bigint not null default 0,
  status          text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'void')),
  invoice_number  text check (length(invoice_number) <= 40),
  created_by      uuid default public.current_actor_id(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (academy_id, id),
  unique (membership_id, period_start),
  check (discount_cents <= amount_cents),
  check (paid_cents >= 0 and paid_cents <= amount_cents - discount_cents),
  check (concept <> 'membership' or (membership_id is not null and period_start is not null and period_end is not null)),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict,
  foreign key (academy_id, membership_id) references public.memberships (academy_id, id) on delete restrict
);

create index charges_student_idx on public.charges (student_id, due_date);
create index charges_open_idx on public.charges (academy_id, due_date) where status in ('open', 'partially_paid');

-- ---------------------------------------------------------------------
-- Pagos e imputaciones
-- ---------------------------------------------------------------------

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete restrict,
  student_id     uuid not null,
  method         text not null check (method in ('cash', 'transfer', 'qr', 'card_pos', 'mp_checkout', 'mp_subscription', 'other')),
  amount_cents   bigint not null check (amount_cents > 0),
  paid_at        timestamptz not null default now(),
  reference      text check (length(reference) <= 80),          -- N° de operación, comprobante, etc.
  status         text not null default 'approved' check (status in ('approved', 'void')),
  registered_by  uuid default public.current_actor_id(),
  void_reason    text check (length(void_reason) <= 200),
  voided_by      uuid,
  voided_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (academy_id, id),
  check (status <> 'void' or void_reason is not null),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict
);

create index payments_academy_paid_idx on public.payments (academy_id, paid_at desc);
create index payments_student_idx on public.payments (student_id, paid_at desc);

create table public.payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete restrict,
  payment_id    uuid not null,
  charge_id     uuid not null,
  amount_cents  bigint not null check (amount_cents > 0),
  created_at    timestamptz not null default now(),
  unique (payment_id, charge_id),
  foreign key (academy_id, payment_id) references public.payments (academy_id, id) on delete restrict,
  foreign key (academy_id, charge_id) references public.charges (academy_id, id) on delete restrict
);

-- Recalcula lo pagado y el estado de un cargo a partir de sus imputaciones vigentes.
create or replace function public.recalc_charge(p_charge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_paid bigint;
begin
  select coalesce(sum(a.amount_cents), 0) into v_paid
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id and p.status = 'approved'
  where a.charge_id = p_charge_id;

  update public.charges
     set paid_cents = v_paid,
         status = case
           when status = 'void' then 'void'
           when v_paid >= total_cents then 'paid'
           when v_paid > 0 then 'partially_paid'
           else 'open'
         end
   where id = p_charge_id;
end;
$$;

-- Registra un pago y lo imputa a un cargo, en un solo paso. Uso interno.
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
  if p_method not in ('cash', 'transfer', 'qr', 'card_pos', 'other') then
    raise exception 'Medio de pago inválido.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe tiene que ser mayor a cero.' using errcode = '22023';
  end if;
  if p_amount_cents > v_charge.total_cents - v_charge.paid_cents then
    raise exception 'El importe supera lo que se debe de ese cargo.' using errcode = '22023', hint = 'overpay';
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

create or replace function public.require_payments_register()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if v_academy is null or not public.has_permission('payments.register') then
    raise exception 'No tenés permiso para registrar pagos.' using errcode = '42501';
  end if;
  return v_academy;
end;
$$;

-- ---------------------------------------------------------------------
-- Cuota de profe: primer pago y meses siguientes
-- ---------------------------------------------------------------------

create or replace function public.membership_charge_description(p_membership_id uuid, p_start date, p_end date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select left(format('%s · Prof. %s · %s al %s', p.name, t.display_name,
                     to_char(p_start, 'DD/MM'), to_char(p_end, 'DD/MM')), 200)
  from public.memberships m
  join public.plans p on p.id = m.plan_id
  join public.teachers t on t.id = m.teacher_id
  where m.id = p_membership_id;
$$;

-- Primer pago: fija el día de vencimiento (el de hoy), emite el cargo del primer
-- mes con el precio vigente y registra el pago (total o parcial).
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
  v_price := public.plan_price_on(v_m.plan_id, v_today);
  if v_price is null then
    raise exception 'El plan no tiene precio vigente.' using errcode = 'P0002';
  end if;

  update public.memberships set anchor_day = v_anchor where id = p_membership_id;
  v_end := public.add_months_anchored(v_today, 1, v_anchor) - 1;
  insert into public.charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
  values (v_academy, v_m.student_id, 'membership', v_m.id, v_today, v_end, v_today,
          public.membership_charge_description(v_m.id, v_today, v_end), v_price)
  returning id into v_charge;

  return public.record_payment(v_academy, v_charge, p_amount_cents, p_method, p_reference);
end;
$$;

-- Cobrar (total o parcialmente) un cargo existente.
create or replace function public.pay_charge(p_charge_id uuid, p_amount_cents bigint, p_method text, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.require_payments_register();
begin
  return public.record_payment(v_academy, p_charge_id, p_amount_cents, p_method, p_reference);
end;
$$;

-- Anular un pago cargado por error. Sólo administración (finance.view), con motivo.
create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_charge uuid;
begin
  if v_academy is null or not public.has_permission('finance.view') then
    raise exception 'Sólo administración puede anular pagos.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Escribí el motivo de la anulación.' using errcode = '22023';
  end if;
  update public.payments
     set status = 'void', void_reason = left(trim(p_reason), 200), voided_by = auth.uid(), voided_at = now()
   where id = p_payment_id and academy_id = v_academy and status = 'approved';
  if not found then
    raise exception 'Ese pago ya estaba anulado o no existe.' using errcode = 'P0002';
  end if;
  for v_charge in select charge_id from public.payment_allocations where payment_id = p_payment_id loop
    perform public.recalc_charge(v_charge);
  end loop;
end;
$$;

-- Genera los cargos de los meses siguientes de cada cuota activa, unos días antes
-- de vencer (regla due_reminder_days). No genera más si la cuota lleva
-- demasiado tiempo suspendida (regla suspension_alert_days): eso lo decide administración.
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
      v_price := public.plan_price_on(m.plan_id, v_start);
      exit when v_price is null;
      insert into public.charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
      values (p_academy_id, m.student_id, 'membership', m.id, v_start, v_end, v_start,
              public.membership_charge_description(m.id, v_start, v_end), v_price)
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

create table public.charge_generation_runs (
  academy_id  uuid primary key references public.academies(id) on delete cascade,
  ran_on      date not null,
  ran_at      timestamptz not null default now()
);

-- La app la llama al mostrar cuotas o pagos: genera una vez por día.
create or replace function public.ensure_charges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if v_academy is null then return 0; end if;
  if exists (select 1 from public.charge_generation_runs
             where academy_id = v_academy and ran_on >= public.academy_today(v_academy)) then
    return 0;
  end if;
  return public.generate_membership_charges(v_academy);
end;
$$;

-- La baja de una cuota anula sus cargos futuros que no tienen ningún pago.
create or replace function public.end_membership(p_membership_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_people_manage();
  v_today date := public.academy_today(v_academy);
begin
  update public.memberships
     set status = 'ended', ended_on = v_today, ended_reason = nullif(left(trim(coalesce(p_reason, '')), 200), '')
   where id = p_membership_id and academy_id = v_academy and status = 'active';
  if not found then
    raise exception 'Esa cuota ya no está activa.' using errcode = 'P0002';
  end if;
  update public.enrollments set status = 'ended', ends_on = v_today
   where membership_id = p_membership_id and status = 'active';
  update public.charges set status = 'void'
   where membership_id = p_membership_id and status = 'open' and paid_cents = 0 and due_date > v_today;
end;
$$;

-- ---------------------------------------------------------------------
-- Fecha de actualización, auditoría y seguridad
-- ---------------------------------------------------------------------

create trigger charges_touch before update on public.charges for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();
create trigger charges_audit after insert or update or delete on public.charges for each row execute function public.write_audit_log();
create trigger payments_audit after insert or update or delete on public.payments for each row execute function public.write_audit_log();
create trigger payment_allocations_audit after insert or update or delete on public.payment_allocations for each row execute function public.write_audit_log();

alter table public.charges                enable row level security;
alter table public.payments               enable row level security;
alter table public.payment_allocations    enable row level security;
alter table public.charge_generation_runs enable row level security;

revoke all on public.charges, public.payments, public.payment_allocations, public.charge_generation_runs from anon, authenticated;
grant select on public.charges, public.payments, public.payment_allocations to authenticated;

-- El alumno ve lo suyo; recepción (payments.register) y administración (finance.view) ven todo.
-- Los profes no ven montos.
create policy "Mis cargos, o todos si cobro" on public.charges
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    or (academy_id = public.current_academy_id()
        and (public.has_permission('payments.register') or public.has_permission('finance.view')))
  );
create policy "Mis pagos, o todos si cobro" on public.payments
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    or (academy_id = public.current_academy_id()
        and (public.has_permission('payments.register') or public.has_permission('finance.view')))
  );
create policy "Imputaciones visibles con su pago" on public.payment_allocations
  for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id));

-- Funciones internas.
revoke all on function public.recalc_charge(uuid) from public, anon, authenticated;
revoke all on function public.record_payment(uuid, uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.require_payments_register() from public, anon, authenticated;
revoke all on function public.generate_membership_charges(uuid) from public, anon, authenticated;
revoke all on function public.membership_charge_description(uuid, date, date) from public, anon, authenticated;

-- Acciones para la app (cada una verifica permisos por dentro).
revoke all on function public.first_membership_payment(uuid, bigint, text, text) from public, anon;
revoke all on function public.pay_charge(uuid, bigint, text, text) from public, anon;
revoke all on function public.void_payment(uuid, text) from public, anon;
revoke all on function public.ensure_charges() from public, anon;
grant execute on function public.first_membership_payment(uuid, bigint, text, text) to authenticated;
grant execute on function public.pay_charge(uuid, bigint, text, text) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.ensure_charges() to authenticated;
