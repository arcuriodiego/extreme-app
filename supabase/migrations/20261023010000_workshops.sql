-- =====================================================================
-- Migración 0012 · Workshops
-- Workshops con una o varias jornadas, cupo y precio; inscripción de
-- alumnos y de externos (recepción les crea una ficha "Ocasional" sin cuenta);
-- cobro con los cargos de siempre; cancelación con 48 h o más devuelve el
-- dinero, con menos no (decisión de Diego, 22 oct). Devoluciones registradas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Workshops y jornadas
-- ---------------------------------------------------------------------

create table public.workshops (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  title         text not null check (length(trim(title)) between 1 and 80),
  description   text check (length(description) <= 2000),
  teacher_name  text check (length(teacher_name) <= 80),   -- puede ser un profe invitado
  price_cents   bigint not null check (price_cents > 0 and price_cents < 100000000000),
  capacity      integer not null check (capacity between 1 and 500),
  status        text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by    uuid default public.current_actor_id(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (academy_id, id)
);

create table public.workshop_sessions (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  workshop_id  uuid not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  room_id      uuid not null,
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '12 hours'),
  foreign key (academy_id, workshop_id) references public.workshops (academy_id, id) on delete cascade,
  foreign key (academy_id, room_id) references public.rooms (academy_id, id) on delete restrict
);

create index workshop_sessions_workshop_idx on public.workshop_sessions (workshop_id, starts_at);

-- Cada jornada ocupa su sala: no puede pisar una clase ni otro workshop.
create or replace function public.sync_workshop_occupancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if tg_op = 'DELETE' then
    delete from public.room_occupancies where source_kind = 'workshop' and source_id = old.id;
    return null;
  end if;
  select status into v_status from public.workshops where id = new.workshop_id;
  if v_status = 'cancelled' then
    delete from public.room_occupancies where source_kind = 'workshop' and source_id = new.id;
  else
    insert into public.room_occupancies (academy_id, room_id, during, source_kind, source_id)
    values (new.academy_id, new.room_id, tstzrange(new.starts_at, new.ends_at), 'workshop', new.id)
    on conflict (source_kind, source_id) do update set room_id = excluded.room_id, during = excluded.during;
  end if;
  return null;
end;
$$;

create trigger workshop_sessions_occupancy after insert or update or delete on public.workshop_sessions
  for each row execute function public.sync_workshop_occupancy();

-- ---------------------------------------------------------------------
-- Inscripciones y devoluciones
-- ---------------------------------------------------------------------

create table public.workshop_registrations (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete restrict,
  workshop_id    uuid not null,
  student_id     uuid not null,
  charge_id      uuid not null,
  status         text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancelled_at   timestamptz,
  cancel_reason  text check (length(cancel_reason) <= 200),
  refund_cents   bigint not null default 0 check (refund_cents >= 0),  -- lo que corresponde devolver
  refunded_cents bigint not null default 0 check (refunded_cents >= 0), -- lo ya devuelto
  created_by     uuid default public.current_actor_id(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (academy_id, id),
  check (refunded_cents <= refund_cents),
  foreign key (academy_id, workshop_id) references public.workshops (academy_id, id) on delete restrict,
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict,
  foreign key (academy_id, charge_id) references public.charges (academy_id, id) on delete restrict
);

create unique index workshop_registrations_active_key on public.workshop_registrations (workshop_id, student_id)
  where status = 'confirmed';

-- Dinero devuelto. Resta en la caja del día en que se devuelve.
create table public.refunds (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete restrict,
  student_id       uuid not null,
  registration_id  uuid,
  method           text not null check (method in ('cash', 'transfer', 'qr', 'card_pos', 'other')),
  amount_cents     bigint not null check (amount_cents > 0),
  reason           text not null check (length(reason) between 1 and 200),
  refunded_at      timestamptz not null default now(),
  registered_by    uuid default public.current_actor_id(),
  created_at       timestamptz not null default now(),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict,
  foreign key (academy_id, registration_id) references public.workshop_registrations (academy_id, id) on delete restrict
);

create index refunds_academy_idx on public.refunds (academy_id, refunded_at desc);

-- ---------------------------------------------------------------------
-- Acciones de recepción
-- ---------------------------------------------------------------------

-- Inscribe a un alumno (o externo con ficha) y emite el cargo del workshop.
create or replace function public.register_workshop(p_workshop_id uuid, p_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_w public.workshops;
  v_taken integer;
  v_charge uuid;
  v_reg uuid;
  v_today date := public.academy_today(v_academy);
begin
  select * into v_w from public.workshops where id = p_workshop_id and academy_id = v_academy for update;
  if not found then
    raise exception 'No encontramos ese workshop.' using errcode = 'P0002';
  end if;
  if v_w.status <> 'published' then
    raise exception 'Ese workshop no está abierto a inscripciones.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.workshop_sessions where workshop_id = p_workshop_id and starts_at > now()) then
    raise exception 'Ese workshop ya empezó o no tiene fechas.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and academy_id = v_academy) then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.workshop_registrations
             where workshop_id = p_workshop_id and student_id = p_student_id and status = 'confirmed') then
    raise exception 'Ya está inscripto en ese workshop.' using errcode = '23505';
  end if;
  select count(*) into v_taken from public.workshop_registrations where workshop_id = p_workshop_id and status = 'confirmed';
  if v_taken >= v_w.capacity then
    raise exception 'No hay lugar: el workshop está completo.' using errcode = 'P0001';
  end if;

  insert into public.charges (academy_id, student_id, concept, due_date, description, amount_cents)
  values (v_academy, p_student_id, 'workshop', v_today, left('Workshop · ' || v_w.title, 200), v_w.price_cents)
  returning id into v_charge;
  insert into public.workshop_registrations (academy_id, workshop_id, student_id, charge_id)
  values (v_academy, p_workshop_id, p_student_id, v_charge)
  returning id into v_reg;
  return v_reg;
end;
$$;

-- Crea la ficha de un externo (sin cuenta, estado Ocasional) y lo inscribe.
create or replace function public.register_workshop_guest(
  p_workshop_id uuid, p_first_name text, p_last_name text, p_phone text, p_dni text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_student uuid;
  v_dni text := nullif(upper(regexp_replace(coalesce(p_dni, ''), '[.\s-]', '', 'g')), '');
begin
  if length(trim(coalesce(p_first_name, ''))) = 0 then
    raise exception 'Escribí el nombre.' using errcode = '22023';
  end if;
  -- Si ya existe una ficha con ese DNI, se usa esa.
  if v_dni is not null then
    select id into v_student from public.students where academy_id = v_academy and upper(dni) = v_dni;
  end if;
  if v_student is null then
    insert into public.students (academy_id, first_name, last_name, phone, dni, status)
    values (v_academy, left(trim(p_first_name), 80), left(trim(coalesce(p_last_name, '')), 80),
            nullif(trim(coalesce(p_phone, '')), ''), v_dni, 'occasional')
    returning id into v_student;
  end if;
  return public.register_workshop(p_workshop_id, v_student);
end;
$$;

-- Cancela una inscripción. Con 48 h o más antes de la primera jornada, corresponde
-- devolver lo pagado; con menos, no. Si no había pagado nada, el cargo se anula.
create or replace function public.cancel_workshop_registration(p_registration_id uuid, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_reg public.workshop_registrations;
  v_charge public.charges;
  v_first timestamptz;
  v_refund bigint := 0;
begin
  select * into v_reg from public.workshop_registrations
   where id = p_registration_id and academy_id = v_academy and status = 'confirmed' for update;
  if not found then
    raise exception 'Esa inscripción ya estaba cancelada.' using errcode = 'P0002';
  end if;
  select * into v_charge from public.charges where id = v_reg.charge_id for update;
  select min(starts_at) into v_first from public.workshop_sessions where workshop_id = v_reg.workshop_id;

  if v_first is null or now() <= v_first - interval '48 hours' then
    v_refund := v_charge.paid_cents;
  end if;

  update public.workshop_registrations
     set status = 'cancelled', cancelled_at = now(), refund_cents = v_refund,
         cancel_reason = nullif(left(trim(coalesce(p_reason, '')), 200), '')
   where id = p_registration_id;

  -- Sin pagos, no queda nada por cobrar.
  if v_charge.paid_cents = 0 then
    update public.charges set status = 'void' where id = v_charge.id;
  end if;
  return v_refund;
end;
$$;

-- Registra que se devolvió el dinero de una inscripción cancelada.
create or replace function public.record_workshop_refund(p_registration_id uuid, p_method text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_reg public.workshop_registrations;
  v_title text;
  v_amount bigint;
begin
  select * into v_reg from public.workshop_registrations
   where id = p_registration_id and academy_id = v_academy and status = 'cancelled' for update;
  if not found then
    raise exception 'No encontramos esa inscripción cancelada.' using errcode = 'P0002';
  end if;
  v_amount := v_reg.refund_cents - v_reg.refunded_cents;
  if v_amount <= 0 then
    raise exception 'No hay nada pendiente de devolver.' using errcode = 'P0001';
  end if;
  if p_method not in ('cash', 'transfer', 'qr', 'card_pos', 'other') then
    raise exception 'Medio inválido.' using errcode = '22023';
  end if;
  select title into v_title from public.workshops where id = v_reg.workshop_id;
  insert into public.refunds (academy_id, student_id, registration_id, method, amount_cents, reason)
  values (v_academy, v_reg.student_id, v_reg.id, p_method, v_amount, left('Devolución workshop · ' || v_title, 200));
  update public.workshop_registrations set refunded_cents = refund_cents where id = v_reg.id;
end;
$$;

-- Cancelar el workshop entero: libera las salas y a todos los inscriptos les corresponde devolución.
create or replace function public.cancel_workshop(p_workshop_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  r record;
  v_n integer := 0;
begin
  if v_academy is null or not public.has_permission('classes.manage') then
    raise exception 'No tenés permiso para cancelar workshops.' using errcode = '42501';
  end if;
  update public.workshops set status = 'cancelled' where id = p_workshop_id and academy_id = v_academy and status <> 'cancelled';
  if not found then
    raise exception 'Ese workshop ya estaba cancelado o no existe.' using errcode = 'P0002';
  end if;
  delete from public.room_occupancies o using public.workshop_sessions s
   where o.source_kind = 'workshop' and o.source_id = s.id and s.workshop_id = p_workshop_id;
  for r in select wr.id, c.paid_cents, c.id as charge_id
           from public.workshop_registrations wr join public.charges c on c.id = wr.charge_id
           where wr.workshop_id = p_workshop_id and wr.status = 'confirmed' loop
    update public.workshop_registrations
       set status = 'cancelled', cancelled_at = now(), refund_cents = r.paid_cents, cancel_reason = 'Workshop cancelado por la academia'
     where id = r.id;
    if r.paid_cents = 0 then
      update public.charges set status = 'void' where id = r.charge_id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Lugares tomados por workshop (visible para todos sin exponer quiénes).
create or replace function public.workshop_taken_counts()
returns table (workshop_id uuid, taken integer)
language sql
stable
security definer
set search_path = public
as $$
  select workshop_id, count(*)::integer from public.workshop_registrations
  where academy_id = public.current_academy_id() and status = 'confirmed'
  group by workshop_id;
$$;

-- ---------------------------------------------------------------------
-- Fecha de actualización, auditoría y seguridad
-- ---------------------------------------------------------------------

create trigger workshops_touch before update on public.workshops for each row execute function public.touch_updated_at();
create trigger workshop_registrations_touch before update on public.workshop_registrations for each row execute function public.touch_updated_at();
create trigger workshops_audit after insert or update or delete on public.workshops for each row execute function public.write_audit_log();
create trigger workshop_sessions_audit after insert or update or delete on public.workshop_sessions for each row execute function public.write_audit_log();
create trigger workshop_registrations_audit after insert or update or delete on public.workshop_registrations for each row execute function public.write_audit_log();
create trigger refunds_audit after insert or update or delete on public.refunds for each row execute function public.write_audit_log();

alter table public.workshops              enable row level security;
alter table public.workshop_sessions      enable row level security;
alter table public.workshop_registrations enable row level security;
alter table public.refunds                enable row level security;

revoke all on public.workshops, public.workshop_sessions, public.workshop_registrations, public.refunds from anon, authenticated;
grant select on public.workshops, public.workshop_sessions, public.workshop_registrations, public.refunds to authenticated;
grant insert, update on public.workshops to authenticated;
grant insert, delete on public.workshop_sessions to authenticated;

-- Los alumnos ven los workshops publicados; el personal, todos.
create policy "Workshops publicados, o todos para el personal" on public.workshops
  for select to authenticated
  using (academy_id = public.current_academy_id()
         and (status = 'published' or public.has_permission('people.view') or public.has_permission('classes.manage')));
create policy "Administración crea workshops" on public.workshops
  for insert to authenticated
  with check (academy_id = public.current_academy_id() and public.has_permission('classes.manage'));
create policy "Administración edita workshops" on public.workshops
  for update to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('classes.manage'))
  with check (academy_id = public.current_academy_id() and status <> 'cancelled');

create policy "Jornadas visibles con su workshop" on public.workshop_sessions
  for select to authenticated
  using (exists (select 1 from public.workshops w where w.id = workshop_id));
create policy "Administración agrega jornadas" on public.workshop_sessions
  for insert to authenticated
  with check (academy_id = public.current_academy_id() and public.has_permission('classes.manage'));
create policy "Administración quita jornadas" on public.workshop_sessions
  for delete to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('classes.manage'));

create policy "Mis inscripciones, o todas si cobro" on public.workshop_registrations
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    or (academy_id = public.current_academy_id()
        and (public.has_permission('payments.register') or public.has_permission('people.view')))
  );
create policy "Mis devoluciones, o todas si cobro" on public.refunds
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    or (academy_id = public.current_academy_id()
        and (public.has_permission('payments.register') or public.has_permission('finance.view')))
  );

revoke all on function public.sync_workshop_occupancy() from public, anon, authenticated;
revoke all on function public.register_workshop(uuid, uuid) from public, anon;
revoke all on function public.register_workshop_guest(uuid, text, text, text, text) from public, anon;
revoke all on function public.cancel_workshop_registration(uuid, text) from public, anon;
revoke all on function public.record_workshop_refund(uuid, text) from public, anon;
revoke all on function public.cancel_workshop(uuid) from public, anon;
revoke all on function public.workshop_taken_counts() from public, anon;
grant execute on function public.register_workshop(uuid, uuid) to authenticated;
grant execute on function public.register_workshop_guest(uuid, text, text, text, text) to authenticated;
grant execute on function public.cancel_workshop_registration(uuid, text) to authenticated;
grant execute on function public.record_workshop_refund(uuid, text) to authenticated;
grant execute on function public.cancel_workshop(uuid) to authenticated;
grant execute on function public.workshop_taken_counts() to authenticated;
