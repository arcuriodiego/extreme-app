-- =====================================================================
-- Migración 0004 · Roles y permisos
--
-- Una persona puede tener varios roles (ej. profesora y alumna).
-- Cada rol es un conjunto de permisos. La base decide qué ve y qué hace
-- cada uno: aunque una pantalla tuviera un error, no entrega datos ajenos.
--
-- Roles iniciales: administración, recepción, profesor, alumno, tutor.
-- Los roles sólo se cambian con grant_role / revoke_role (controladas y auditadas).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Email en el perfil (para que recepción y administración puedan buscar
-- personas). Se copia de la cuenta y se mantiene sincronizado.
-- ---------------------------------------------------------------------

alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;
create index profiles_email_idx on public.profiles (academy_id, lower(email));

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- ---------------------------------------------------------------------
-- Catálogo de permisos (común a todas las academias)
-- ---------------------------------------------------------------------

create table public.permissions (
  code        text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);

insert into public.permissions (code, description) values
  ('people.view',         'Ver personas y perfiles de la academia'),
  ('people.manage',       'Editar datos de personas de la academia'),
  ('roles.manage',        'Asignar y quitar roles'),
  ('settings.manage',     'Cambiar reglas y precios'),
  ('audit.view',          'Ver el registro de auditoría'),
  ('finance.view',        'Ver ingresos, gastos y reportes financieros'),
  ('payments.register',   'Registrar cobros en efectivo o transferencia'),
  ('attendance.mark',     'Registrar asistencia y validar pases'),
  ('classes.manage',      'Crear y modificar grupos, horarios y clases'),
  ('classes.view_roster', 'Ver la lista de alumnos de una clase');

-- ---------------------------------------------------------------------
-- Roles por academia
-- ---------------------------------------------------------------------

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  code        text not null check (code ~ '^[a-z_]{2,30}$'),
  name        text not null check (length(trim(name)) > 0),
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (academy_id, code)
);

create trigger roles_touch before update on public.roles
  for each row execute function public.touch_updated_at();

create table public.role_permissions (
  role_id         uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role_id     uuid not null references public.roles(id) on delete restrict,
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (profile_id, role_id)
);

create index user_roles_academy_idx on public.user_roles (academy_id);

-- La persona, el rol y la asignación tienen que ser de la misma academia.
create or replace function public.check_user_role_academy()
returns trigger
language plpgsql
as $$
begin
  if (select academy_id from public.profiles where id = new.profile_id) is distinct from new.academy_id
     or (select academy_id from public.roles where id = new.role_id) is distinct from new.academy_id then
    raise exception 'La persona, el rol y la asignación deben ser de la misma academia.';
  end if;
  return new;
end;
$$;

create trigger user_roles_same_academy before insert or update on public.user_roles
  for each row execute function public.check_user_role_academy();

create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function public.write_audit_log();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.write_audit_log();
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.write_audit_log();

-- Roles iniciales de una academia.
create or replace function public.seed_default_roles(p_academy_id uuid)
returns void
language plpgsql
as $$
declare
  v_role uuid;
begin
  insert into public.roles (academy_id, code, name, description, is_system) values
    (p_academy_id, 'admin',     'Administración', 'Acceso completo a la gestión de la academia', true),
    (p_academy_id, 'reception', 'Recepción',      'Alumnos, cobros, asistencia y operación diaria', true),
    (p_academy_id, 'teacher',   'Profesor',       'Sus clases, listas y asistencia', true),
    (p_academy_id, 'student',   'Alumno',         'Clases, reservas, pagos y pases propios', true),
    (p_academy_id, 'guardian',  'Tutor',          'Administra a alumnos menores vinculados', true)
  on conflict (academy_id, code) do nothing;

  select id into v_role from public.roles where academy_id = p_academy_id and code = 'admin';
  insert into public.role_permissions (role_id, permission_code)
    select v_role, code from public.permissions
  on conflict do nothing;

  select id into v_role from public.roles where academy_id = p_academy_id and code = 'reception';
  insert into public.role_permissions (role_id, permission_code) values
    (v_role, 'people.view'), (v_role, 'people.manage'), (v_role, 'payments.register'),
    (v_role, 'attendance.mark'), (v_role, 'classes.view_roster')
  on conflict do nothing;

  select id into v_role from public.roles where academy_id = p_academy_id and code = 'teacher';
  insert into public.role_permissions (role_id, permission_code) values
    (v_role, 'attendance.mark'), (v_role, 'classes.view_roster')
  on conflict do nothing;
end;
$$;

create or replace function public.academies_after_insert()
returns trigger
language plpgsql
as $$
begin
  perform public.seed_default_settings(new.id);
  perform public.seed_default_roles(new.id);
  return new;
end;
$$;

-- Academias que ya existían.
do $$
declare v_id uuid;
begin
  for v_id in select id from public.academies loop
    perform public.seed_default_roles(v_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Funciones de consulta de permisos (usadas por las políticas y la app)
-- ---------------------------------------------------------------------

create or replace function public.current_academy_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select academy_id from public.profiles where id = auth.uid();
$$;

create or replace function public.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.profiles p on p.id = ur.profile_id and p.academy_id = ur.academy_id
    where ur.profile_id = auth.uid() and rp.permission_code = p_code
  );
$$;

-- Permisos y roles del usuario actual, para que la app muestre u oculte opciones.
create or replace function public.my_access()
returns table (role_codes text[], permission_codes text[])
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}'),
    coalesce(array_agg(distinct rp.permission_code) filter (where rp.permission_code is not null), '{}')
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  left join public.role_permissions rp on rp.role_id = ur.role_id
  where ur.profile_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Asignar y quitar roles (únicas vías permitidas)
-- ---------------------------------------------------------------------

create or replace function public.grant_role(p_profile_id uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_role uuid;
begin
  if auth.uid() is null or not public.has_permission('roles.manage') then
    raise exception 'No tenés permiso para asignar roles.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id and academy_id = v_academy) then
    raise exception 'Esa persona no pertenece a la academia.' using errcode = 'P0002';
  end if;
  select id into v_role from public.roles where academy_id = v_academy and code = p_role_code;
  if v_role is null then
    raise exception 'El rol "%" no existe.', p_role_code using errcode = 'P0002';
  end if;

  insert into public.user_roles (academy_id, profile_id, role_id, granted_by)
  values (v_academy, p_profile_id, v_role, auth.uid())
  on conflict (profile_id, role_id) do nothing;
end;
$$;

create or replace function public.revoke_role(p_profile_id uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_role uuid;
begin
  if auth.uid() is null or not public.has_permission('roles.manage') then
    raise exception 'No tenés permiso para quitar roles.' using errcode = '42501';
  end if;
  select id into v_role from public.roles where academy_id = v_academy and code = p_role_code;
  if v_role is null then
    raise exception 'El rol "%" no existe.', p_role_code using errcode = 'P0002';
  end if;

  -- Nunca dejar la academia sin nadie que pueda administrarla.
  if p_role_code = 'admin'
     and exists (select 1 from public.user_roles where profile_id = p_profile_id and role_id = v_role)
     and (select count(*) from public.user_roles where role_id = v_role) <= 1 then
    raise exception 'Tiene que quedar al menos una persona con rol de Administración.' using errcode = 'P0001';
  end if;

  delete from public.user_roles where profile_id = p_profile_id and role_id = v_role;
end;
$$;

-- Primer administrador. Sólo funciona si la academia todavía no tiene ninguno,
-- y sólo se puede ejecutar desde el editor SQL de Supabase (no desde la app).
create or replace function public.bootstrap_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_role uuid;
begin
  select * into v_profile from public.profiles where lower(email) = lower(trim(p_email));
  if v_profile.id is null then
    raise exception 'No hay ninguna cuenta con el email %. Primero creá la cuenta desde la app.', p_email;
  end if;
  select id into v_role from public.roles where academy_id = v_profile.academy_id and code = 'admin';
  if exists (select 1 from public.user_roles where role_id = v_role) then
    raise exception 'La academia ya tiene administración. Asigná roles desde la app.';
  end if;
  insert into public.user_roles (academy_id, profile_id, role_id) values (v_profile.academy_id, v_profile.id, v_role);
  return format('Listo: %s %s ahora tiene rol de Administración.', v_profile.first_name, v_profile.last_name);
end;
$$;

revoke all on function public.grant_role(uuid, text) from public, anon;
revoke all on function public.revoke_role(uuid, text) from public, anon;
revoke all on function public.bootstrap_admin(text) from public, anon, authenticated;
grant execute on function public.grant_role(uuid, text) to authenticated;
grant execute on function public.revoke_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Rol por defecto al registrarse: Alumno. El perfil también guarda el email.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_academy uuid;
  v_role uuid;
begin
  select id into v_academy from public.academies where slug = v_meta ->> 'academy';
  if v_academy is null then
    select id into v_academy from public.academies order by created_at limit 1;
  end if;
  if v_academy is null then
    raise exception 'No hay ninguna academia creada para asociar el usuario.';
  end if;

  insert into public.profiles (id, academy_id, first_name, last_name, email)
  values (
    new.id,
    v_academy,
    left(trim(coalesce(v_meta ->> 'first_name', '')), 80),
    left(trim(coalesce(v_meta ->> 'last_name', '')), 80),
    new.email
  );

  select id into v_role from public.roles where academy_id = v_academy and code = 'student';
  if v_role is not null then
    insert into public.user_roles (academy_id, profile_id, role_id) values (v_academy, new.id, v_role);
  end if;
  return new;
end;
$$;

-- Cuentas que ya existían: rol Alumno si no tenían ninguno.
insert into public.user_roles (academy_id, profile_id, role_id)
select p.academy_id, p.id, r.id
from public.profiles p
join public.roles r on r.academy_id = p.academy_id and r.code = 'student'
where not exists (select 1 from public.user_roles ur where ur.profile_id = p.id);

-- ---------------------------------------------------------------------
-- Seguridad por filas
-- ---------------------------------------------------------------------

alter table public.permissions      enable row level security;
alter table public.roles            enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles       enable row level security;

revoke all on public.permissions, public.roles, public.role_permissions, public.user_roles from anon, authenticated;
grant select on public.permissions, public.roles, public.role_permissions, public.user_roles to authenticated;

create policy "Catálogo de permisos visible" on public.permissions
  for select to authenticated using (true);

create policy "Roles de mi academia" on public.roles
  for select to authenticated using (academy_id = public.current_academy_id());

create policy "Permisos de los roles de mi academia" on public.role_permissions
  for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and r.academy_id = public.current_academy_id()));

create policy "Mis roles, o todos si gestiono personas" on public.user_roles
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (academy_id = public.current_academy_id() and public.has_permission('people.view'))
  );

-- Perfiles: recepción y administración ven y editan los de su academia.
create policy "Personal ve perfiles de su academia" on public.profiles
  for select to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('people.view'));

create policy "Personal edita perfiles de su academia" on public.profiles
  for update to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('people.manage'))
  with check (academy_id = public.current_academy_id());

-- Academia, sedes y salas: visibles para quien pertenece a la academia.
revoke all on public.academies, public.branches, public.rooms from anon, authenticated;
grant select on public.academies, public.branches, public.rooms to authenticated;

create policy "Mi academia" on public.academies
  for select to authenticated using (id = public.current_academy_id());
create policy "Sedes de mi academia" on public.branches
  for select to authenticated using (academy_id = public.current_academy_id());
create policy "Salas de mi academia" on public.rooms
  for select to authenticated using (academy_id = public.current_academy_id());

-- Reglas configurables: todos las leen; sólo quien tiene settings.manage las cambia.
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
grant update (value) on public.app_settings to authenticated;

create policy "Reglas de mi academia" on public.app_settings
  for select to authenticated using (academy_id = public.current_academy_id());
create policy "Administración cambia reglas" on public.app_settings
  for update to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('settings.manage'))
  with check (academy_id = public.current_academy_id());

-- Auditoría: sólo quien tiene audit.view, y sólo de su academia.
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create policy "Auditoría para administración" on public.audit_logs
  for select to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('audit.view'));
