-- =====================================================================
-- Migración 0001 · Base
-- Academias, sedes, salas, reglas configurables y auditoría.
-- Las tablas de personas, grilla, pagos, etc. llegan en migraciones siguientes.
-- =====================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- restricciones de exclusión (salas sin superposición)

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------

-- Mantiene updated_at al día en cada modificación.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Academias
-- Hoy hay una sola (Extreme Dance). La columna academy_id en el resto de
-- las tablas deja preparada la app para ofrecerse a otras academias.
-- ---------------------------------------------------------------------

create table public.academies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (length(trim(name)) > 0),
  timezone    text not null default 'America/Argentina/Buenos_Aires',
  currency    char(3) not null default 'ARS',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger academies_touch before update on public.academies
  for each row execute function public.touch_updated_at();

create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete restrict,
  name        text not null check (length(trim(name)) > 0),
  address     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (academy_id, name)
);

create trigger branches_touch before update on public.branches
  for each row execute function public.touch_updated_at();

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete restrict,
  branch_id   uuid not null references public.branches(id) on delete restrict,
  name        text not null check (length(trim(name)) > 0),
  capacity    integer not null check (capacity > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (branch_id, name)
);

create index rooms_academy_idx on public.rooms (academy_id);

create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Reglas configurables
-- Cada regla tiene una clave conocida y un valor validado.
-- ---------------------------------------------------------------------

create table public.app_settings (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  key         text not null check (key in (
                'grace_days',               -- días de gracia de la cuota de profe
                'suspension_alert_days',    -- días en rojo antes de alertar para decidir la baja
                'due_reminder_days',        -- días antes del vencimiento para avisar
                'cancel_hours',             -- anticipación mínima para devolver la clase
                'credit_days',              -- vigencia del crédito para reservar
                'credit_class_window_days', -- hasta cuántos días después puede ser la clase
                'booking_hold_minutes',     -- tiempo que se guarda un lugar sin pagar
                'session_generation_weeks'  -- semanas de clases generadas por adelantado
              )),
  value       integer not null check (value >= 0 and value <= 1000),
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (academy_id, key)
);

create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- Valores aprobados. Se cargan al crear una academia.
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
    (p_academy_id, 'session_generation_weeks', 8)
  on conflict (academy_id, key) do nothing;
$$;

create or replace function public.academies_after_insert()
returns trigger
language plpgsql
as $$
begin
  perform public.seed_default_settings(new.id);
  return new;
end;
$$;

create trigger academies_seed_settings after insert on public.academies
  for each row execute function public.academies_after_insert();

-- Lectura cómoda de una regla.
create or replace function public.setting(p_academy_id uuid, p_key text)
returns integer
language sql
stable
as $$
  select value from public.app_settings where academy_id = p_academy_id and key = p_key;
$$;

-- ---------------------------------------------------------------------
-- Auditoría
-- Registro de sólo inserción: nadie lo edita ni lo borra.
-- ---------------------------------------------------------------------

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  academy_id  uuid,
  actor_id    uuid,
  table_name  text not null,
  row_id      uuid,
  action      text not null check (action in ('insert', 'update', 'delete')),
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);

create index audit_logs_row_idx on public.audit_logs (table_name, row_id);
create index audit_logs_at_idx on public.audit_logs (at desc);

-- El usuario que hace el cambio. En Supabase sale del token de la sesión;
-- fuera de Supabase (pruebas locales) queda vacío.
create or replace function public.current_actor_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (academy_id, actor_id, table_name, row_id, action, before, after)
  values (
    coalesce((v_row ->> 'academy_id')::uuid, case when tg_table_name = 'academies' then (v_row ->> 'id')::uuid end),
    public.current_actor_id(),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create or replace function public.block_audit_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La auditoría no se puede modificar ni borrar.';
end;
$$;

create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.block_audit_changes();

create trigger academies_audit after insert or update or delete on public.academies
  for each row execute function public.write_audit_log();
create trigger branches_audit after insert or update or delete on public.branches
  for each row execute function public.write_audit_log();
create trigger rooms_audit after insert or update or delete on public.rooms
  for each row execute function public.write_audit_log();
create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------
-- Seguridad
-- Row Level Security activado en todas las tablas desde el principio.
-- Sin políticas, nadie con la clave pública puede leer ni escribir;
-- las políticas por rol llegan con la migración de personas y permisos.
-- ---------------------------------------------------------------------

alter table public.academies    enable row level security;
alter table public.branches     enable row level security;
alter table public.rooms        enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs   enable row level security;
