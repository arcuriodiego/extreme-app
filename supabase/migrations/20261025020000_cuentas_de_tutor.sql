-- =====================================================================
-- Cuentas de tutor (Diego, 25 oct): los padres, madres y tutores no toman
-- clases. Su cuenta no tiene ficha de alumno: sólo maneja a sus hijos.
--
-- - Al registrarse se elige "Voy a tomar clases" o "Soy madre, padre o tutor/a"
--   (metadato account_type = 'guardian'): rol Tutor, sin ficha ni rol Alumno.
-- - Quien ya tenía cuenta de alumno y anota a un hijo: si su ficha propia está
--   vacía (sin cuotas, cobros, packs, reservas, workshops ni ingresos), se borra
--   y queda sólo como tutor. Si tiene actividad, no se toca.
-- =====================================================================

create or replace function public.become_guardian_only(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_student uuid;
begin
  if not exists (select 1 from public.guardians where profile_id = p_profile) then
    return;
  end if;
  if not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                  where ur.profile_id = p_profile and r.code = 'student') then
    return;
  end if;
  select id into v_student from public.students where profile_id = p_profile;
  if v_student is not null then
    if exists (select 1 from public.signup_requests where student_id = v_student and status = 'pending')
       or exists (select 1 from public.workshop_waitlist where student_id = v_student and status in ('waiting', 'offered')) then
      return;
    end if;
    begin
      -- Las tablas con actividad real (cuotas, cobros, reservas…) no dejan borrar la ficha.
      delete from public.students where id = v_student;
    exception when foreign_key_violation then
      return;
    end;
  end if;
  delete from public.user_roles ur
   using public.roles r
   where r.id = ur.role_id and r.code = 'student' and ur.profile_id = p_profile;
end;
$$;

revoke all on function public.become_guardian_only(uuid) from public, anon, authenticated;

-- Registro: alumno (como siempre) o tutor.
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

  insert into public.profiles (id, academy_id, first_name, last_name, email)
  values (
    new.id,
    v_academy,
    left(trim(coalesce(v_meta ->> 'first_name', '')), 80),
    left(trim(coalesce(v_meta ->> 'last_name', '')), 80),
    new.email
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

create or replace function public.submit_signup(
  p_for           text,          -- 'self' o 'child'
  p_first_name    text,
  p_last_name     text,
  p_dni           text,
  p_birth_date    date,
  p_phone         text,
  p_relationship  text,
  p_schedule_ids  uuid[],
  p_note          text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy   uuid := public.current_academy_id();
  v_actor     uuid := auth.uid();
  v_student   uuid;
  v_other     uuid;
  v_guardian  uuid;
  v_role      uuid;
  v_dni       text := upper(nullif(trim(coalesce(p_dni, '')), ''));
  v_phone     text := nullif(trim(coalesce(p_phone, '')), '');
  v_first     text := left(trim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g')), 80);
  v_last      text := left(trim(regexp_replace(coalesce(p_last_name, ''), '\s+', ' ', 'g')), 80);
  v_note      text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_schedules uuid[];
begin
  if v_academy is null or v_actor is null then
    raise exception 'Iniciá sesión para inscribirte.' using errcode = '42501';
  end if;
  if p_for not in ('self', 'child') then
    raise exception 'Elegí para quién es la inscripción.' using errcode = '22023', hint = 'para';
  end if;
  if v_dni is null or v_dni !~ '^[0-9A-Z]{6,12}$' then
    raise exception 'Revisá el DNI.' using errcode = '22023', hint = 'dni';
  end if;
  if p_birth_date is null or p_birth_date < date '1900-01-01' or p_birth_date > current_date then
    raise exception 'Revisá la fecha de nacimiento.' using errcode = '22023', hint = 'nacimiento';
  end if;
  if v_phone is null or v_phone !~ '^[0-9 +()-]{6,25}$' then
    raise exception 'Revisá el teléfono.' using errcode = '22023', hint = 'telefono';
  end if;

  -- Horarios vigentes de grupos activos, sin repetidos.
  select coalesce(array_agg(distinct s.id), '{}') into v_schedules
    from public.class_schedules s
    join public.class_groups g on g.id = s.group_id
   where s.id = any (coalesce(p_schedule_ids, '{}'))
     and s.academy_id = v_academy
     and g.status = 'active'
     and (s.valid_to is null or s.valid_to >= current_date);
  if cardinality(v_schedules) <> cardinality(array(select distinct unnest(coalesce(p_schedule_ids, '{}')))) then
    raise exception 'Uno de los horarios ya no está disponible. Recargá la página.' using errcode = 'P0002', hint = 'horario';
  end if;
  if cardinality(v_schedules) = 0 then
    raise exception 'Elegí al menos un horario.' using errcode = '22023', hint = 'sin-horario';
  end if;
  if cardinality(v_schedules) > 6 then
    raise exception 'Elegí hasta 6 horarios.' using errcode = '22023', hint = 'muchos-horarios';
  end if;

  if p_for = 'self' then
    if not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                    where ur.profile_id = v_actor and r.code = 'student') then
      raise exception 'Tu cuenta es de madre, padre o tutor/a: desde acá anotás a tus hijos.'
        using errcode = '22023', hint = 'cuenta-tutor';
    end if;
    select id into v_student from public.students where academy_id = v_academy and profile_id = v_actor;
    select id into v_other from public.students
     where academy_id = v_academy and upper(dni) = v_dni and id is distinct from v_student;
    if v_other is not null then
      raise exception 'Ya hay un alumno con ese DNI. Pasá por recepción y lo vinculamos a tu cuenta.'
        using errcode = '23505', hint = 'dni-repetido';
    end if;
    if v_student is null then
      insert into public.students (academy_id, profile_id, first_name, last_name)
      select v_academy, p.id, public.profile_display_first_name(p), coalesce(p.last_name, '')
        from public.profiles p where p.id = v_actor
      returning id into v_student;
    end if;
    update public.profiles set birth_date = p_birth_date, phone = v_phone where id = v_actor;
    update public.students set dni = v_dni, phone = v_phone, birth_date = p_birth_date where id = v_student;
  else
    if length(v_first) = 0 then
      raise exception 'Escribí el nombre.' using errcode = '22023', hint = 'nombre';
    end if;
    if p_relationship is null or p_relationship not in ('madre', 'padre', 'tutor') then
      raise exception 'Elegí madre, padre o tutor.' using errcode = '22023', hint = 'relacion';
    end if;

    insert into public.guardians (academy_id, profile_id) values (v_academy, v_actor)
    on conflict (academy_id, profile_id) do nothing;
    select id into v_guardian from public.guardians where academy_id = v_academy and profile_id = v_actor;

    select id into v_other from public.students where academy_id = v_academy and upper(dni) = v_dni;
    if v_other is not null then
      -- Si ya es su hijo (por ejemplo, se anota a otra clase), se reutiliza la ficha.
      if not exists (select 1 from public.guardian_students where guardian_id = v_guardian and student_id = v_other) then
        raise exception 'Ya hay un alumno con ese DNI. Pasá por recepción y lo vinculamos a tu cuenta.'
          using errcode = '23505', hint = 'dni-repetido';
      end if;
      v_student := v_other;
      update public.students set phone = coalesce(phone, v_phone), birth_date = coalesce(birth_date, p_birth_date) where id = v_student;
    else
      -- Límite contra el abuso: hijos anotados desde la app por esta cuenta (el personal no tiene límite).
      if not public.has_permission('people.manage')
         and (select count(distinct r.student_id)
                from public.signup_requests r
                join public.students s on s.id = r.student_id
               where r.requested_by = v_actor and s.profile_id is distinct from v_actor) >= 8 then
        raise exception 'Llegaste al máximo de inscripciones desde tu cuenta. Pasá por recepción.' using errcode = '54000', hint = 'limite';
      end if;
      insert into public.students (academy_id, first_name, last_name, dni, birth_date, phone, created_by)
      values (v_academy, v_first, v_last, v_dni, p_birth_date, v_phone, v_actor)
      returning id into v_student;
      insert into public.guardian_students (academy_id, guardian_id, student_id, relationship, is_primary, created_by)
      values (v_academy, v_guardian, v_student, p_relationship, true, v_actor);
    end if;

    select id into v_role from public.roles where academy_id = v_academy and code = 'guardian';
    if v_role is not null then
      insert into public.user_roles (academy_id, profile_id, role_id, granted_by)
      values (v_academy, v_actor, v_role, v_actor)
      on conflict (profile_id, role_id) do nothing;
    end if;
    -- Los padres no toman clases: si su ficha propia está vacía, la cuenta queda sólo de tutor.
    perform public.become_guardian_only(v_actor);
  end if;

  update public.signup_requests
     set schedule_ids = v_schedules, note = v_note, requested_by = v_actor
   where student_id = v_student and status = 'pending';
  if not found then
    insert into public.signup_requests (academy_id, student_id, requested_by, schedule_ids, note)
    values (v_academy, v_student, v_actor, v_schedules, v_note);
  end if;
  return v_student;
end;
$$;

-- Padres que ya se habían anotado como alumnos: quedan como tutores si su ficha está vacía.
do $$
declare r record;
begin
  for r in select profile_id from public.guardians loop
    perform public.become_guardian_only(r.profile_id);
  end loop;
end $$;
