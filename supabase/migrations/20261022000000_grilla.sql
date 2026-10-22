-- =====================================================================
-- Migración 0005 · Grilla académica
-- Catálogo (estilos, niveles, categorías de edad), profesores,
-- grupos de clase y sus horarios semanales.
-- Las clases concretas por fecha (class_sessions) llegan en otra migración.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Integridad entre academias: cada referencia incluye academy_id, así un
-- grupo nunca puede apuntar al estilo, sala o profe de otra academia.
-- ---------------------------------------------------------------------
alter table public.rooms add constraint rooms_academy_id_id_key unique (academy_id, id);
alter table public.branches add constraint branches_academy_id_id_key unique (academy_id, id);
alter table public.rooms alter column academy_id set default public.current_academy_id();

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------

create table public.dance_styles (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  name        text not null check (length(trim(name)) between 1 and 40),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (academy_id, name),
  unique (academy_id, id)
);

create table public.levels (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  name        text not null check (length(trim(name)) between 1 and 40),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (academy_id, name),
  unique (academy_id, id)
);

create table public.age_categories (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  name        text not null check (length(trim(name)) between 1 and 40),
  min_age     integer check (min_age between 0 and 120),
  max_age     integer check (max_age between 0 and 120),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (academy_id, name),
  unique (academy_id, id),
  check (min_age is null or max_age is null or min_age <= max_age)
);

-- ---------------------------------------------------------------------
-- Profesores
-- Se crean solos al asignar el rol Profesor; al quitarlo quedan inactivos
-- (no se borran: sus clases pasadas siguen apuntando a ellos).
-- ---------------------------------------------------------------------

create table public.teachers (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete restrict,
  profile_id    uuid not null references public.profiles(id) on delete restrict,
  display_name  text not null check (length(trim(display_name)) between 1 and 60),
  bio           text check (length(bio) <= 1000),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (academy_id, profile_id),
  unique (academy_id, id)
);

create or replace function public.sync_teacher_from_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_roles := case when tg_op = 'DELETE' then old else new end;
  v_name text;
begin
  if (select code from public.roles where id = v_row.role_id) <> 'teacher' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    select coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email, 'Profe')
      into v_name from public.profiles where id = v_row.profile_id;
    insert into public.teachers (academy_id, profile_id, display_name)
    values (v_row.academy_id, v_row.profile_id, left(v_name, 60))
    on conflict (academy_id, profile_id) do update set active = true;
  else
    update public.teachers set active = false
    where academy_id = v_row.academy_id and profile_id = v_row.profile_id;
  end if;
  return null;
end;
$$;

create trigger user_roles_sync_teacher after insert or delete on public.user_roles
  for each row execute function public.sync_teacher_from_role();

-- Profes que ya tenían el rol antes de esta migración.
insert into public.teachers (academy_id, profile_id, display_name)
select ur.academy_id, p.id, left(coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email, 'Profe'), 60)
from public.user_roles ur
join public.roles r on r.id = ur.role_id and r.code = 'teacher'
join public.profiles p on p.id = ur.profile_id
on conflict (academy_id, profile_id) do nothing;

-- ---------------------------------------------------------------------
-- Grupos de clase: el curso recurrente (estilo + categoría + nivel + profe).
-- ---------------------------------------------------------------------

create table public.class_groups (
  id                     uuid primary key default gen_random_uuid(),
  academy_id             uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  style_id               uuid not null,
  age_category_id        uuid not null,
  level_id               uuid,                 -- opcional: hay grupos sin nivel
  teacher_id             uuid,                 -- opcional: "profe a definir"
  capacity               integer not null check (capacity between 1 and 200),
  allows_single_booking  boolean not null default true, -- acepta clases sueltas y packs
  description            text check (length(description) <= 1000),
  status                 text not null default 'active' check (status in ('active', 'paused', 'closed')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, style_id) references public.dance_styles (academy_id, id) on delete restrict,
  foreign key (academy_id, age_category_id) references public.age_categories (academy_id, id) on delete restrict,
  foreign key (academy_id, level_id) references public.levels (academy_id, id) on delete restrict,
  foreign key (academy_id, teacher_id) references public.teachers (academy_id, id) on delete restrict
);

create index class_groups_academy_idx on public.class_groups (academy_id, status);

-- ---------------------------------------------------------------------
-- Horarios semanales de cada grupo, con vigencia.
-- La hora es la de la academia (Buenos Aires).
-- ---------------------------------------------------------------------

create table public.class_schedules (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  group_id    uuid not null,
  weekday     smallint not null check (weekday between 1 and 7), -- 1 = lunes … 7 = domingo
  start_time  time not null,
  end_time    time not null,
  room_id     uuid not null,
  valid_from  date not null default current_date,
  valid_to    date,                                              -- vacío = sin fecha de fin
  start_min   integer generated always as ((extract(hour from start_time) * 60 + extract(minute from start_time))::integer) stored,
  end_min     integer generated always as ((extract(hour from end_time) * 60 + extract(minute from end_time))::integer) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_time > start_time),
  check (end_time - start_time >= interval '15 minutes'),
  check (valid_to is null or valid_to >= valid_from),
  foreign key (academy_id, group_id) references public.class_groups (academy_id, id) on delete cascade,
  foreign key (academy_id, room_id) references public.rooms (academy_id, id) on delete restrict,
  -- Una sala no puede tener dos horarios que se pisen el mismo día de la semana.
  constraint class_schedules_room_overlap exclude using gist (
    room_id with =,
    weekday with =,
    int4range(start_min, end_min) with &&,
    daterange(valid_from, valid_to, '[]') with &&
  )
);

create index class_schedules_group_idx on public.class_schedules (group_id);

-- ---------------------------------------------------------------------
-- Catálogo inicial aprobado. Se carga en cada academia nueva.
-- ---------------------------------------------------------------------

create or replace function public.seed_default_catalog(p_academy_id uuid)
returns void
language sql
as $$
  insert into public.dance_styles (academy_id, name, sort_order) values
    (p_academy_id, 'Reggaetón', 1), (p_academy_id, 'Hip Hop', 2), (p_academy_id, 'Fusión', 3),
    (p_academy_id, 'Femme', 4), (p_academy_id, 'Coreografía', 5), (p_academy_id, 'Heels', 6)
  on conflict (academy_id, name) do nothing;
  insert into public.levels (academy_id, name, sort_order) values
    (p_academy_id, 'Principiante', 1), (p_academy_id, 'Intermedio', 2)
  on conflict (academy_id, name) do nothing;
  insert into public.age_categories (academy_id, name, sort_order) values
    (p_academy_id, 'Infantil', 1), (p_academy_id, 'Teens', 2), (p_academy_id, 'Adultos', 3)
  on conflict (academy_id, name) do nothing;
$$;

create or replace function public.academies_after_insert()
returns trigger
language plpgsql
as $$
begin
  perform public.seed_default_settings(new.id);
  perform public.seed_default_roles(new.id);
  perform public.seed_default_catalog(new.id);
  return new;
end;
$$;

select public.seed_default_catalog(id) from public.academies;

-- ---------------------------------------------------------------------
-- Fecha de actualización y auditoría
-- ---------------------------------------------------------------------

create trigger dance_styles_touch before update on public.dance_styles for each row execute function public.touch_updated_at();
create trigger levels_touch before update on public.levels for each row execute function public.touch_updated_at();
create trigger age_categories_touch before update on public.age_categories for each row execute function public.touch_updated_at();
create trigger teachers_touch before update on public.teachers for each row execute function public.touch_updated_at();
create trigger class_groups_touch before update on public.class_groups for each row execute function public.touch_updated_at();
create trigger class_schedules_touch before update on public.class_schedules for each row execute function public.touch_updated_at();

create trigger dance_styles_audit after insert or update or delete on public.dance_styles for each row execute function public.write_audit_log();
create trigger levels_audit after insert or update or delete on public.levels for each row execute function public.write_audit_log();
create trigger age_categories_audit after insert or update or delete on public.age_categories for each row execute function public.write_audit_log();
create trigger teachers_audit after insert or update or delete on public.teachers for each row execute function public.write_audit_log();
create trigger class_groups_audit after insert or update or delete on public.class_groups for each row execute function public.write_audit_log();
create trigger class_schedules_audit after insert or update or delete on public.class_schedules for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------
-- Seguridad
-- Todos los de la academia ven la grilla. Sólo quien tiene classes.manage
-- (administración) la cambia.
-- ---------------------------------------------------------------------

alter table public.dance_styles    enable row level security;
alter table public.levels          enable row level security;
alter table public.age_categories  enable row level security;
alter table public.teachers        enable row level security;
alter table public.class_groups    enable row level security;
alter table public.class_schedules enable row level security;

revoke all on public.dance_styles, public.levels, public.age_categories, public.teachers,
  public.class_groups, public.class_schedules from anon, authenticated;

grant select, insert, update, delete on public.dance_styles, public.levels, public.age_categories,
  public.class_groups, public.class_schedules to authenticated;
grant select on public.teachers to authenticated;
-- De un profe sólo se edita lo que se muestra; el vínculo y el estado los maneja el rol.
grant update (display_name, bio) on public.teachers to authenticated;
-- Salas: hasta ahora sólo lectura.
grant insert, update on public.rooms to authenticated;

do $$
declare t text;
begin
  foreach t in array array['dance_styles', 'levels', 'age_categories', 'class_groups', 'class_schedules'] loop
    execute format(
      'create policy "Grilla visible en mi academia" on public.%I for select to authenticated
         using (academy_id = public.current_academy_id())', t);
    execute format(
      'create policy "Administración carga la grilla" on public.%I for insert to authenticated
         with check (academy_id = public.current_academy_id() and public.has_permission(''classes.manage''))', t);
    execute format(
      'create policy "Administración edita la grilla" on public.%I for update to authenticated
         using (academy_id = public.current_academy_id() and public.has_permission(''classes.manage''))
         with check (academy_id = public.current_academy_id())', t);
    execute format(
      'create policy "Administración borra de la grilla" on public.%I for delete to authenticated
         using (academy_id = public.current_academy_id() and public.has_permission(''classes.manage''))', t);
  end loop;
end $$;

create policy "Profes de mi academia" on public.teachers
  for select to authenticated using (academy_id = public.current_academy_id());
create policy "Administración edita profes" on public.teachers
  for update to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('classes.manage'))
  with check (academy_id = public.current_academy_id());

create policy "Administración crea salas" on public.rooms
  for insert to authenticated
  with check (academy_id = public.current_academy_id() and public.has_permission('classes.manage'));
create policy "Administración edita salas" on public.rooms
  for update to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('classes.manage'))
  with check (academy_id = public.current_academy_id());
