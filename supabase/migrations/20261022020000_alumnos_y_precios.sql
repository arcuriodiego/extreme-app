-- =====================================================================
-- Migración 0007 · Alumnos, planes y precios
-- Fichas de alumnos (con o sin cuenta), notas internas del personal,
-- planes y su historial de precios.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Alumnos
-- Quien tiene cuenta y rol Alumno tiene ficha automáticamente.
-- Recepción puede crear fichas sin cuenta (menores, o quien todavía no
-- usa la app). Nombre y nacimiento de una ficha con cuenta se copian del perfil.
-- ---------------------------------------------------------------------

create table public.students (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  profile_id  uuid references public.profiles(id) on delete restrict,
  first_name  text not null check (length(trim(first_name)) between 1 and 80),
  last_name   text not null default '' check (length(last_name) <= 80),
  dni         text check (dni ~ '^[0-9A-Za-z]{6,12}$'),
  birth_date  date check (birth_date is null or birth_date >= date '1900-01-01'),
  phone       text check (phone is null or phone ~ '^[0-9 +()-]{6,25}$'),
  status      text not null default 'active' check (status in ('trial', 'active', 'occasional', 'inactive')),
  joined_at   date not null default current_date,
  created_by  uuid default public.current_actor_id(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (academy_id, profile_id),
  unique (academy_id, id)
);

create unique index students_dni_key on public.students (academy_id, upper(dni)) where dni is not null;
create index students_name_idx on public.students (academy_id, last_name, first_name);

-- Notas internas: tabla aparte para que el alumno, que puede leer su ficha, nunca las vea.
create table public.student_notes (
  student_id  uuid primary key references public.students(id) on delete cascade,
  academy_id  uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  notes       text not null default '' check (length(notes) <= 2000),
  updated_by  uuid default public.current_actor_id(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.profile_display_first_name(p public.profiles)
returns text
language sql
immutable
as $$
  select left(coalesce(nullif(trim(p.first_name), ''), nullif(split_part(coalesce(p.email, ''), '@', 1), ''), 'Alumno'), 80);
$$;

create or replace function public.sync_student_from_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_profile public.profiles;
begin
  if (select code from public.roles where id = new.role_id) <> 'student' then
    return null;
  end if;
  select * into v_profile from public.profiles where id = new.profile_id;
  insert into public.students (academy_id, profile_id, first_name, last_name, birth_date)
  values (new.academy_id, v_profile.id, public.profile_display_first_name(v_profile), coalesce(v_profile.last_name, ''), v_profile.birth_date)
  on conflict (academy_id, profile_id) do nothing;
  return null;
end;
$$;

create trigger user_roles_sync_student after insert on public.user_roles
  for each row execute function public.sync_student_from_role();

-- Si la persona cambia su nombre o fecha de nacimiento en la app, la ficha se actualiza.
create or replace function public.sync_student_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students
     set first_name = public.profile_display_first_name(new),
         last_name = coalesce(new.last_name, ''),
         birth_date = coalesce(new.birth_date, birth_date)
   where profile_id = new.id;
  return null;
end;
$$;

create trigger profiles_sync_student after update of first_name, last_name, birth_date on public.profiles
  for each row execute function public.sync_student_from_profile();

-- Fichas para quienes ya tenían rol Alumno.
insert into public.students (academy_id, profile_id, first_name, last_name, birth_date)
select p.academy_id, p.id, public.profile_display_first_name(p), coalesce(p.last_name, ''), p.birth_date
from public.profiles p
join public.user_roles ur on ur.profile_id = p.id
join public.roles r on r.id = ur.role_id and r.code = 'student'
on conflict (academy_id, profile_id) do nothing;

-- ---------------------------------------------------------------------
-- Planes y precios
-- ---------------------------------------------------------------------

create table public.plans (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete restrict,
  kind              text not null check (kind in ('teacher_monthly', 'pack', 'single_class')),
  name              text not null check (length(trim(name)) between 1 and 60),
  classes_per_week  integer check (classes_per_week between 1 and 7),
  class_count       integer check (class_count between 1 and 100),
  duration_months   integer not null default 1 check (duration_months between 1 and 12),
  has_grace         boolean not null default false,
  allows_autopay    boolean not null default false,
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (academy_id, name),
  unique (academy_id, id),
  check (kind <> 'teacher_monthly' or classes_per_week is not null),
  check (kind <> 'pack' or class_count is not null)
);

create table public.plan_prices (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete restrict,
  plan_id       uuid not null,
  amount_cents  bigint not null check (amount_cents > 0 and amount_cents < 100000000000),
  valid_from    date not null,
  created_by    uuid default public.current_actor_id(),
  created_at    timestamptz not null default now(),
  unique (plan_id, valid_from),
  foreign key (academy_id, plan_id) references public.plans (academy_id, id) on delete restrict
);

-- Precio de un plan en una fecha: el último que empezó a regir hasta ese día.
create or replace function public.plan_price_on(p_plan_id uuid, p_date date)
returns bigint
language sql
stable
as $$
  select amount_cents from public.plan_prices
  where plan_id = p_plan_id and valid_from <= p_date
  order by valid_from desc
  limit 1;
$$;

create or replace function public.seed_default_plans(p_academy_id uuid)
returns void
language sql
as $$
  insert into public.plans (academy_id, kind, name, classes_per_week, class_count, has_grace, allows_autopay, sort_order) values
    (p_academy_id, 'teacher_monthly', 'Cuota de profe', 2, null, true, true, 1),
    (p_academy_id, 'pack', 'Pack 10 clases', null, 10, false, false, 2),
    (p_academy_id, 'pack', 'Pack 16 clases', null, 16, false, false, 3),
    (p_academy_id, 'single_class', 'Clase individual', null, 1, false, false, 4)
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
  perform public.seed_default_plans(new.id);
  return new;
end;
$$;

select public.seed_default_plans(id) from public.academies;

-- Precios aprobados por dirección para Extreme Dance (octubre 2026).
insert into public.plan_prices (academy_id, plan_id, amount_cents, valid_from)
select p.academy_id, p.id, v.cents, (now() at time zone 'America/Argentina/Buenos_Aires')::date
from public.plans p
join public.academies a on a.id = p.academy_id and a.slug = 'extreme-dance'
join (values ('Cuota de profe', 5550000), ('Pack 10 clases', 6600000), ('Pack 16 clases', 10300000), ('Clase individual', 1150000))
  as v(name, cents) on v.name = p.name
on conflict (plan_id, valid_from) do nothing;

-- Programar un precio (hoy o más adelante). El mismo día reemplaza al cargado.
create or replace function public.set_plan_price(p_plan_id uuid, p_amount_cents bigint, p_valid_from date)
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
  insert into public.plan_prices (academy_id, plan_id, amount_cents, valid_from)
  values (v_academy, p_plan_id, p_amount_cents, p_valid_from)
  on conflict (plan_id, valid_from) do update set amount_cents = excluded.amount_cents, created_by = public.current_actor_id();
end;
$$;

-- Quitar un precio programado que todavía no empezó a regir.
create or replace function public.remove_plan_price(p_price_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if v_academy is null or not public.has_permission('settings.manage') then
    raise exception 'No tenés permiso para cambiar precios.' using errcode = '42501';
  end if;
  delete from public.plan_prices
   where id = p_price_id and academy_id = v_academy
     and valid_from > (now() at time zone (select timezone from public.academies where id = v_academy))::date;
  if not found then
    raise exception 'Sólo se pueden quitar precios que todavía no empezaron a regir.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Fecha de actualización y auditoría
-- ---------------------------------------------------------------------

create trigger students_touch before update on public.students for each row execute function public.touch_updated_at();
create trigger student_notes_touch before update on public.student_notes for each row execute function public.touch_updated_at();
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();

create trigger students_audit after insert or update or delete on public.students for each row execute function public.write_audit_log();
create trigger student_notes_audit after insert or update or delete on public.student_notes for each row execute function public.write_audit_log();
create trigger plans_audit after insert or update or delete on public.plans for each row execute function public.write_audit_log();
create trigger plan_prices_audit after insert or update or delete on public.plan_prices for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------

alter table public.students      enable row level security;
alter table public.student_notes enable row level security;
alter table public.plans         enable row level security;
alter table public.plan_prices   enable row level security;

revoke all on public.students, public.student_notes, public.plans, public.plan_prices from anon, authenticated;

grant select on public.students to authenticated;
grant insert (first_name, last_name, dni, birth_date, phone, status, joined_at) on public.students to authenticated;
grant update (first_name, last_name, dni, birth_date, phone, status) on public.students to authenticated;

create policy "Mi ficha, o todas si veo personas" on public.students
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (academy_id = public.current_academy_id() and public.has_permission('people.view'))
  );
-- Desde la app sólo se crean fichas sin cuenta; las con cuenta nacen solas con el rol.
create policy "Recepción crea fichas" on public.students
  for insert to authenticated
  with check (academy_id = public.current_academy_id() and public.has_permission('people.manage') and profile_id is null);
create policy "Recepción edita fichas" on public.students
  for update to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('people.manage'))
  with check (academy_id = public.current_academy_id());

grant select, insert, update on public.student_notes to authenticated;
create policy "Notas para el personal" on public.student_notes
  for select to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('people.view'));
create policy "Personal escribe notas" on public.student_notes
  for insert to authenticated
  with check (academy_id = public.current_academy_id() and public.has_permission('people.manage')
              and exists (select 1 from public.students s where s.id = student_id and s.academy_id = public.current_academy_id()));
create policy "Personal edita notas" on public.student_notes
  for update to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('people.manage'))
  with check (academy_id = public.current_academy_id());

grant select on public.plans, public.plan_prices to authenticated;
create policy "Planes de mi academia" on public.plans
  for select to authenticated using (academy_id = public.current_academy_id());
create policy "Precios de mi academia" on public.plan_prices
  for select to authenticated using (academy_id = public.current_academy_id());

revoke all on function public.set_plan_price(uuid, bigint, date) from public, anon;
revoke all on function public.remove_plan_price(uuid) from public, anon;
grant execute on function public.set_plan_price(uuid, bigint, date) to authenticated;
grant execute on function public.remove_plan_price(uuid) to authenticated;
revoke all on function public.sync_student_from_role() from public, anon, authenticated;
revoke all on function public.sync_student_from_profile() from public, anon, authenticated;
