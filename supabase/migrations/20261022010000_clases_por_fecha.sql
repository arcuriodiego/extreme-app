-- =====================================================================
-- Migración 0006 · Clases por fecha
-- Clases concretas (class_sessions) generadas desde los horarios semanales,
-- feriados y cierres, cancelaciones puntuales, reemplazos de profe,
-- ocupación de salas y profes sin superposición.
-- =====================================================================

alter table public.class_schedules add constraint class_schedules_academy_id_id_key unique (academy_id, id);

-- ---------------------------------------------------------------------
-- Feriados y cierres
-- ---------------------------------------------------------------------

create table public.calendar_exceptions (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  date         date not null,
  kind         text not null default 'holiday' check (kind in ('holiday', 'closure')),
  description  text not null check (length(trim(description)) between 1 and 80),
  created_by   uuid default public.current_actor_id(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (academy_id, date)
);

-- ---------------------------------------------------------------------
-- Clases concretas
-- ---------------------------------------------------------------------

create table public.class_sessions (
  id                     uuid primary key default gen_random_uuid(),
  academy_id             uuid not null references public.academies(id) on delete restrict,
  group_id               uuid not null,
  schedule_id            uuid,           -- vacío si es una clase extra o si el horario se borró
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  room_id                uuid not null,
  teacher_id             uuid,
  substitute_teacher_id  uuid,           -- reemplazo para esta fecha
  capacity               integer not null check (capacity between 1 and 200),
  status                 text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  cancel_reason          text check (length(cancel_reason) <= 200),
  cancelled_by           uuid,
  cancelled_at           timestamptz,
  exception_id           uuid references public.calendar_exceptions(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status <> 'cancelled' or cancel_reason is not null),
  unique (schedule_id, starts_at),
  unique (academy_id, id),
  foreign key (academy_id, group_id) references public.class_groups (academy_id, id) on delete restrict,
  foreign key (academy_id, schedule_id) references public.class_schedules (academy_id, id) on delete set null (schedule_id),
  foreign key (academy_id, room_id) references public.rooms (academy_id, id) on delete restrict,
  foreign key (academy_id, teacher_id) references public.teachers (academy_id, id) on delete restrict,
  foreign key (academy_id, substitute_teacher_id) references public.teachers (academy_id, id) on delete restrict,
  -- Un profe no puede dar dos clases a la vez (cuenta el reemplazo si lo hay).
  constraint class_sessions_teacher_overlap exclude using gist (
    (coalesce(substitute_teacher_id, teacher_id)) with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled' and coalesce(substitute_teacher_id, teacher_id) is not null)
);

create index class_sessions_academy_starts_idx on public.class_sessions (academy_id, starts_at);
create index class_sessions_group_idx on public.class_sessions (group_id, starts_at);

-- ---------------------------------------------------------------------
-- Ocupación de salas
-- Toda ocupación (clases, y más adelante workshops, alquileres y bloqueos)
-- pasa por acá: una sala nunca tiene dos usos superpuestos.
-- ---------------------------------------------------------------------

create table public.room_occupancies (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete restrict,
  room_id      uuid not null,
  during       tstzrange not null,
  source_kind  text not null check (source_kind in ('session', 'workshop', 'rental', 'block')),
  source_id    uuid not null,
  created_at   timestamptz not null default now(),
  unique (source_kind, source_id),
  foreign key (academy_id, room_id) references public.rooms (academy_id, id) on delete restrict,
  constraint room_occupancies_no_overlap exclude using gist (room_id with =, during with &&)
);

create or replace function public.sync_session_occupancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or new.status = 'cancelled' then
    delete from public.room_occupancies where source_kind = 'session' and source_id = coalesce(new.id, old.id);
  else
    insert into public.room_occupancies (academy_id, room_id, during, source_kind, source_id)
    values (new.academy_id, new.room_id, tstzrange(new.starts_at, new.ends_at), 'session', new.id)
    on conflict (source_kind, source_id) do update set room_id = excluded.room_id, during = excluded.during;
  end if;
  return null;
end;
$$;

create trigger class_sessions_occupancy after insert or update or delete on public.class_sessions
  for each row execute function public.sync_session_occupancy();

-- ---------------------------------------------------------------------
-- Profes sin superposición en la grilla semanal
-- ---------------------------------------------------------------------

-- ¿El profe de este grupo tiene otro grupo activo que se pisa con alguno de sus horarios?
create or replace function public.group_has_teacher_conflict(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_groups g
    join public.class_schedules s on s.group_id = g.id
    join public.class_groups g2 on g2.teacher_id = g.teacher_id and g2.id <> g.id and g2.status = 'active'
    join public.class_schedules s2 on s2.group_id = g2.id
    where g.id = p_group_id
      and g.teacher_id is not null
      and g.status = 'active'
      and s2.weekday = s.weekday
      and int4range(s2.start_min, s2.end_min) && int4range(s.start_min, s.end_min)
      and daterange(s2.valid_from, s2.valid_to, '[]') && daterange(s.valid_from, s.valid_to, '[]')
  );
$$;

create or replace function public.check_teacher_weekly_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
begin
  -- plpgsql evalúa los campos del registro según la tabla: hay que separar los casos.
  if tg_table_name = 'class_groups' then
    v_group := new.id;
  else
    v_group := new.group_id;
  end if;
  if public.group_has_teacher_conflict(v_group) then
    raise exception 'El profe ya tiene otro grupo en ese horario.' using errcode = 'P0001', hint = 'teacher_conflict';
  end if;
  return null;
end;
$$;

-- Los nombres empiezan con "a_" para que se ejecuten antes que la generación de clases
-- (los disparadores de una tabla corren en orden alfabético) y el mensaje sea claro.
create constraint trigger a_class_schedules_teacher_conflict after insert or update on public.class_schedules
  for each row execute function public.check_teacher_weekly_conflict();
create constraint trigger a_class_groups_teacher_conflict after update of teacher_id, status on public.class_groups
  for each row execute function public.check_teacher_weekly_conflict();

-- ---------------------------------------------------------------------
-- Generación de clases
-- Crea las clases de las próximas N semanas (regla session_generation_weeks).
-- Es idempotente: si la clase ya existe, no la toca.
-- Las fechas con feriado se crean ya suspendidas, así al borrar el feriado vuelven.
-- ---------------------------------------------------------------------

create table public.session_generation_runs (
  academy_id  uuid primary key references public.academies(id) on delete cascade,
  ran_on      date not null,
  ran_at      timestamptz not null default now()
);

create or replace function public.generate_sessions(p_academy_id uuid, p_schedule_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz     text := (select timezone from public.academies where id = p_academy_id);
  v_today  date := (now() at time zone v_tz)::date;
  v_until  date := v_today + coalesce(public.setting(p_academy_id, 'session_generation_weeks'), 8) * 7 - 1;
  r        record;
  d        date;
  v_start  timestamptz;
  v_exc    public.calendar_exceptions;
  v_n      integer;
  v_total  integer := 0;
begin
  for r in
    select s.id, s.group_id, s.weekday, s.start_time, s.end_time, s.room_id, s.valid_from, s.valid_to,
           g.teacher_id, g.capacity
    from public.class_schedules s
    join public.class_groups g on g.id = s.group_id
    where s.academy_id = p_academy_id
      and g.status = 'active'
      and (p_schedule_id is null or s.id = p_schedule_id)
      and s.valid_from <= v_until
      and (s.valid_to is null or s.valid_to >= v_today)
  loop
    for d in
      select gs::date from generate_series(greatest(v_today, r.valid_from), least(v_until, coalesce(r.valid_to, v_until)), interval '1 day') gs
    loop
      continue when extract(isodow from d) <> r.weekday;
      v_start := (d + r.start_time) at time zone v_tz;
      continue when v_start <= now();

      select * into v_exc from public.calendar_exceptions where academy_id = p_academy_id and date = d;

      begin
        insert into public.class_sessions (academy_id, group_id, schedule_id, starts_at, ends_at, room_id, teacher_id, capacity,
                                           status, cancel_reason, cancelled_at, exception_id)
        values (p_academy_id, r.group_id, r.id, v_start, (d + r.end_time) at time zone v_tz, r.room_id, r.teacher_id, r.capacity,
                case when v_exc.id is null then 'scheduled' else 'cancelled' end,
                v_exc.description,
                case when v_exc.id is null then null else now() end,
                v_exc.id)
        on conflict (schedule_id, starts_at) do nothing;
        get diagnostics v_n = row_count;
        v_total := v_total + v_n;
      exception when exclusion_violation then
        -- Choca con otro uso de la sala o con otra clase del profe (por ejemplo, un reemplazo):
        -- esa fecha queda sin generar y se resuelve a mano.
        null;
      end;
    end loop;
  end loop;

  if p_schedule_id is null then
    insert into public.session_generation_runs (academy_id, ran_on) values (p_academy_id, v_today)
    on conflict (academy_id) do update set ran_on = excluded.ran_on, ran_at = now();
  end if;
  return v_total;
end;
$$;

-- La app la llama al mostrar clases: genera una vez por día, el resto de las veces no hace nada.
create or replace function public.ensure_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_tz text;
begin
  if v_academy is null then return 0; end if;
  v_tz := (select timezone from public.academies where id = v_academy);
  if exists (select 1 from public.session_generation_runs
             where academy_id = v_academy and ran_on >= (now() at time zone v_tz)::date) then
    return 0;
  end if;
  return public.generate_sessions(v_academy);
end;
$$;

-- ---------------------------------------------------------------------
-- Mantener las clases futuras al día cuando cambia la grilla.
-- Hoy todavía no hay reservas: las clases futuras se pueden rehacer.
-- Cuando existan reservas, estos cambios tendrán que respetarlas.
-- ---------------------------------------------------------------------

create or replace function public.schedules_sync_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.class_sessions where schedule_id = old.id and starts_at > now();
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.generate_sessions(new.academy_id, new.id);
  end if;
  return null;
end;
$$;

-- Al borrar, antes de que la clave del horario se vacíe en las clases.
create trigger class_schedules_sessions_delete before delete on public.class_schedules
  for each row execute function public.schedules_sync_sessions();
create trigger class_schedules_sessions_insert after insert on public.class_schedules
  for each row execute function public.schedules_sync_sessions();
create trigger class_schedules_sessions_update after update of weekday, start_time, end_time, room_id, valid_from, valid_to
  on public.class_schedules
  for each row execute function public.schedules_sync_sessions();

create or replace function public.groups_sync_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare s record;
begin
  if new.status <> 'active' and old.status = 'active' then
    delete from public.class_sessions where group_id = new.id and starts_at > now();
  elsif new.status = 'active' and old.status <> 'active' then
    for s in select id from public.class_schedules where group_id = new.id loop
      perform public.generate_sessions(new.academy_id, s.id);
    end loop;
  else
    if new.teacher_id is distinct from old.teacher_id then
      update public.class_sessions set teacher_id = new.teacher_id
      where group_id = new.id and starts_at > now();
    end if;
    if new.capacity <> old.capacity then
      update public.class_sessions set capacity = new.capacity
      where group_id = new.id and starts_at > now();
    end if;
  end if;
  return null;
end;
$$;

create trigger class_groups_sessions after update of status, teacher_id, capacity on public.class_groups
  for each row execute function public.groups_sync_sessions();

-- ---------------------------------------------------------------------
-- Acciones de administración (únicas formas de cambiar clases y feriados)
-- ---------------------------------------------------------------------

create or replace function public.require_classes_manage()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if v_academy is null or not public.has_permission('classes.manage') then
    raise exception 'No tenés permiso para cambiar clases.' using errcode = '42501';
  end if;
  return v_academy;
end;
$$;

create or replace function public.add_calendar_exception(p_date date, p_description text, p_kind text default 'holiday')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_classes_manage();
  v_tz text := (select timezone from public.academies where id = v_academy);
  v_id uuid;
begin
  insert into public.calendar_exceptions (academy_id, date, kind, description)
  values (v_academy, p_date, p_kind, trim(p_description))
  returning id into v_id;

  update public.class_sessions
     set status = 'cancelled', cancel_reason = trim(p_description), exception_id = v_id,
         cancelled_at = now(), cancelled_by = auth.uid()
   where academy_id = v_academy
     and status = 'scheduled'
     and (starts_at at time zone v_tz)::date = p_date;
  return v_id;
end;
$$;

create or replace function public.remove_calendar_exception(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.require_classes_manage();
begin
  if not exists (select 1 from public.calendar_exceptions where id = p_id and academy_id = v_academy) then
    raise exception 'No encontramos ese feriado.' using errcode = 'P0002';
  end if;
  update public.class_sessions
     set status = 'scheduled', cancel_reason = null, exception_id = null, cancelled_at = null, cancelled_by = null
   where exception_id = p_id and starts_at > now();
  delete from public.calendar_exceptions where id = p_id;
end;
$$;

create or replace function public.cancel_session(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.require_classes_manage();
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Escribí el motivo de la suspensión.' using errcode = '22023';
  end if;
  update public.class_sessions
     set status = 'cancelled', cancel_reason = left(trim(p_reason), 200), cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_id and academy_id = v_academy and status = 'scheduled' and starts_at > now();
  if not found then
    raise exception 'Esa clase ya empezó, ya está suspendida o no existe.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.require_classes_manage();
begin
  update public.class_sessions
     set status = 'scheduled', cancel_reason = null, cancelled_at = null, cancelled_by = null
   where id = p_id and academy_id = v_academy and status = 'cancelled' and exception_id is null and starts_at > now();
  if not found then
    raise exception 'No se puede volver a activar esa clase (ya pasó, o la suspendió un feriado: borrá el feriado).' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_substitute(p_id uuid, p_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_classes_manage();
  v_session public.class_sessions;
begin
  select * into v_session from public.class_sessions
   where id = p_id and academy_id = v_academy and starts_at > now() for update;
  if not found then
    raise exception 'Esa clase ya empezó o no existe.' using errcode = 'P0002';
  end if;
  if p_teacher_id is not null and not exists (
    select 1 from public.teachers where id = p_teacher_id and academy_id = v_academy and active
  ) then
    raise exception 'Ese profe no está activo.' using errcode = 'P0002';
  end if;
  update public.class_sessions
     set substitute_teacher_id = case when p_teacher_id = v_session.teacher_id then null else p_teacher_id end
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Fecha de actualización, auditoría y seguridad
-- ---------------------------------------------------------------------

create trigger calendar_exceptions_touch before update on public.calendar_exceptions for each row execute function public.touch_updated_at();
create trigger class_sessions_touch before update on public.class_sessions for each row execute function public.touch_updated_at();
create trigger calendar_exceptions_audit after insert or update or delete on public.calendar_exceptions for each row execute function public.write_audit_log();
create trigger class_sessions_audit after insert or update or delete on public.class_sessions for each row execute function public.write_audit_log();

alter table public.calendar_exceptions     enable row level security;
alter table public.class_sessions          enable row level security;
alter table public.room_occupancies        enable row level security;
alter table public.session_generation_runs enable row level security;

revoke all on public.calendar_exceptions, public.class_sessions, public.room_occupancies, public.session_generation_runs
  from anon, authenticated;
grant select on public.calendar_exceptions, public.class_sessions, public.room_occupancies to authenticated;

create policy "Feriados de mi academia" on public.calendar_exceptions
  for select to authenticated using (academy_id = public.current_academy_id());
create policy "Clases de mi academia" on public.class_sessions
  for select to authenticated using (academy_id = public.current_academy_id());
create policy "Ocupación de salas para el personal" on public.room_occupancies
  for select to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('classes.view_roster'));

-- Funciones internas: nadie las llama desde la app.
revoke all on function public.generate_sessions(uuid, uuid) from public, anon, authenticated;
revoke all on function public.group_has_teacher_conflict(uuid) from public, anon, authenticated;
revoke all on function public.require_classes_manage() from public, anon, authenticated;
revoke all on function public.sync_session_occupancy() from public, anon, authenticated;
revoke all on function public.check_teacher_weekly_conflict() from public, anon, authenticated;
revoke all on function public.schedules_sync_sessions() from public, anon, authenticated;
revoke all on function public.groups_sync_sessions() from public, anon, authenticated;

-- Acciones disponibles para la app (cada una verifica permisos por dentro).
revoke all on function public.ensure_sessions() from public, anon;
revoke all on function public.add_calendar_exception(date, text, text) from public, anon;
revoke all on function public.remove_calendar_exception(uuid) from public, anon;
revoke all on function public.cancel_session(uuid, text) from public, anon;
revoke all on function public.restore_session(uuid) from public, anon;
revoke all on function public.set_substitute(uuid, uuid) from public, anon;
grant execute on function public.ensure_sessions() to authenticated;
grant execute on function public.add_calendar_exception(date, text, text) to authenticated;
grant execute on function public.remove_calendar_exception(uuid) to authenticated;
grant execute on function public.cancel_session(uuid, text) to authenticated;
grant execute on function public.restore_session(uuid) to authenticated;
grant execute on function public.set_substitute(uuid, uuid) to authenticated;

-- Clases para los horarios que ya estaban cargados.
select public.generate_sessions(id) from public.academies;
