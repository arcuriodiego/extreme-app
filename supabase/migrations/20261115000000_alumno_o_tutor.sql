-- =====================================================================
-- Alumno o tutor (Diego, 15 nov): la primera vez que entra, Inicio pregunta
-- "Soy alumno/a" o "Soy madre, padre o tutor/a", y la app se arma según eso.
-- Al alumno nunca le aparece "Anotar a un hijo/a"; al tutor, sólo lo de sus hijos.
--
-- profiles.account_kind: 'student' | 'guardian' | null (todavía no eligió).
-- El registro ya no pregunta: toda cuenta nueva arranca como alumno (con ficha
-- vacía) y elige en Inicio. Si elige tutor, la ficha vacía se borra.
-- =====================================================================

alter table public.profiles
  add column account_kind text check (account_kind in ('student', 'guardian'));

comment on column public.profiles.account_kind is
  'Cómo usa la app: alumno (toma clases) o tutor (anota a sus hijos). Null = todavía no eligió en Inicio.';

-- Cuentas existentes: tutores sin rol Alumno → tutor; alumnos con actividad → alumno.
update public.profiles p set account_kind = 'guardian'
where exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.profile_id = p.id and r.code = 'guardian')
  and not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.profile_id = p.id and r.code = 'student');

update public.profiles p set account_kind = 'student'
where account_kind is null
  and exists (
    select 1 from public.students s
    where s.profile_id = p.id
      and (exists (select 1 from public.memberships m where m.student_id = s.id)
        or exists (select 1 from public.signup_requests sr where sr.student_id = s.id)
        or exists (select 1 from public.charges c where c.student_id = s.id)
        or exists (select 1 from public.bookings b where b.student_id = s.id))
  );

-- Elegir en Inicio.
create or replace function public.choose_account_kind(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_academy uuid := public.current_academy_id();
  v_role uuid;
begin
  if v_me is null or v_academy is null then
    raise exception 'Iniciá sesión.' using errcode = '42501';
  end if;
  if p_kind not in ('student', 'guardian') then
    raise exception 'Elegí alumno o tutor.' using errcode = '22023';
  end if;

  if p_kind = 'guardian' then
    insert into public.guardians (academy_id, profile_id) values (v_academy, v_me)
    on conflict (academy_id, profile_id) do nothing;
    select id into v_role from public.roles where academy_id = v_academy and code = 'guardian';
    insert into public.user_roles (academy_id, profile_id, role_id) values (v_academy, v_me, v_role)
    on conflict do nothing;
    -- La ficha propia vacía se borra (si tiene actividad, no se toca y sigue siendo también alumno).
    perform public.become_guardian_only(v_me);
  end if;

  update public.profiles set account_kind = p_kind where id = v_me;
end;
$$;

revoke all on function public.choose_account_kind(text) from public, anon;
grant execute on function public.choose_account_kind(text) to authenticated;

-- Quien se inscribe a sí mismo queda como alumno (sin volver a preguntar).
create or replace function public.signup_sets_account_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p set account_kind = 'student'
  from public.students s
  where s.id = new.student_id and s.profile_id = p.id and p.account_kind is null;
  return new;
end;
$$;

create trigger signup_requests_account_kind
  after insert on public.signup_requests
  for each row execute function public.signup_sets_account_kind();

-- Registro: el que elige tutor desde un enlace viejo queda tutor; el resto elige en Inicio.
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
  v_guardian boolean := (v_meta ->> 'account_type') = 'guardian';
begin
  select id into v_academy from public.academies where slug = v_meta ->> 'academy';
  if v_academy is null then
    select id into v_academy from public.academies order by created_at limit 1;
  end if;
  if v_academy is null then
    raise exception 'No hay ninguna academia creada para asociar el usuario.';
  end if;

  insert into public.profiles (id, academy_id, first_name, last_name, email, account_kind)
  values (
    new.id,
    v_academy,
    left(trim(coalesce(v_meta ->> 'first_name', '')), 80),
    left(trim(coalesce(v_meta ->> 'last_name', '')), 80),
    new.email,
    case when v_guardian then 'guardian' end
  );

  if v_guardian then
    insert into public.guardians (academy_id, profile_id) values (v_academy, new.id)
    on conflict (academy_id, profile_id) do nothing;
    select id into v_role from public.roles where academy_id = v_academy and code = 'guardian';
  else
    select id into v_role from public.roles where academy_id = v_academy and code = 'student';
  end if;
  if v_role is not null then
    insert into public.user_roles (academy_id, profile_id, role_id) values (v_academy, new.id, v_role);
  end if;
  return new;
end;
$$;
