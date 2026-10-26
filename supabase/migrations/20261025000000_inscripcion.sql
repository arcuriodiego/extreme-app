-- =====================================================================
-- Entrega 19 · Autoinscripción.
--
-- El alumno (o su madre, padre o tutor) completa sus datos desde la app y
-- elige los horarios a los que quiere ir. Queda una inscripción pendiente
-- que recepción revisa: al darle la cuota se marca sola como confirmada.
-- El pago sigue siendo en recepción (Mercado Pago llega en la Fase 4).
-- =====================================================================

create table public.signup_requests (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete restrict,
  student_id    uuid not null,
  requested_by  uuid not null references public.profiles(id) on delete restrict,
  schedule_ids  uuid[] not null default '{}' check (cardinality(schedule_ids) <= 6),
  note          text check (length(note) <= 500),
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  handled_by    uuid references public.profiles(id) on delete set null,
  handled_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete cascade
);

create unique index signup_requests_one_pending on public.signup_requests (student_id) where status = 'pending';
create index signup_requests_academy_idx on public.signup_requests (academy_id, status, created_at);

create trigger signup_requests_touch before update on public.signup_requests
  for each row execute function public.touch_updated_at();

alter table public.signup_requests enable row level security;
grant select on public.signup_requests to authenticated;

create policy "Mis inscripciones, o todas para el personal" on public.signup_requests
  for select to authenticated
  using (academy_id = public.current_academy_id()
         and (requested_by = (select auth.uid()) or public.has_permission('people.view')));

-- ---------------------------------------------------------------------
-- Enviar la inscripción (para uno mismo o para un hijo).
-- ---------------------------------------------------------------------
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
      if (select count(*) from public.students where academy_id = v_academy and created_by = v_actor and profile_id is null) >= 8 then
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

-- ---------------------------------------------------------------------
-- Recepción: marcar como resuelta o descartar.
-- ---------------------------------------------------------------------
create or replace function public.resolve_signup(p_request_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para resolver inscripciones.' using errcode = '42501';
  end if;
  if p_status not in ('confirmed', 'dismissed') then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  update public.signup_requests
     set status = p_status, handled_by = auth.uid(), handled_at = now()
   where id = p_request_id and academy_id = public.current_academy_id() and status = 'pending';
  if not found then
    raise exception 'Esa inscripción ya se resolvió.' using errcode = 'P0002';
  end if;
end;
$$;

-- Al darle la cuota al alumno, su inscripción queda confirmada sola.
create or replace function public.confirm_signup_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.signup_requests
     set status = 'confirmed', handled_by = public.current_actor_id(), handled_at = now()
   where student_id = new.student_id and status = 'pending';
  return null;
end;
$$;

create trigger memberships_confirm_signup after insert on public.memberships
  for each row execute function public.confirm_signup_on_membership();

revoke all on function public.submit_signup(text, text, text, text, date, text, text, uuid[], text) from public, anon;
revoke all on function public.resolve_signup(uuid, text) from public, anon;
grant execute on function public.submit_signup(text, text, text, text, date, text, text, uuid[], text) to authenticated;
grant execute on function public.resolve_signup(uuid, text) to authenticated;
