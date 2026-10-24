-- Entrega 14 · Tutores de menores.
--
-- - Un tutor (padre, madre u otro adulto) es una persona con cuenta. Recepción lo vincula
--   a la ficha del alumno buscando su cuenta por email (el tutor no se vincula solo).
-- - El tutor ve todo lo del alumno vinculado como si fuera el propio alumno: cuota, clases
--   fijas, packs, reservas, pagos, asistencias y su pase QR. Puede reservar y cancelar por él.
-- - El alumno menor puede no tener cuenta; si la tiene (por ejemplo un adolescente), ambos ven lo mismo.

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table public.guardians (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete restrict,
  profile_id  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (academy_id, profile_id),
  unique (academy_id, id)
);

create table public.guardian_students (
  id                      uuid primary key default gen_random_uuid(),
  academy_id              uuid not null references public.academies(id) on delete restrict,
  guardian_id             uuid not null,
  student_id              uuid not null,
  relationship            text check (relationship in ('madre', 'padre', 'tutor')),
  can_book                boolean not null default true,
  can_pay                 boolean not null default true,
  receives_notifications  boolean not null default true,
  is_primary              boolean not null default false,
  created_by              uuid default public.current_actor_id(),
  created_at              timestamptz not null default now(),
  unique (guardian_id, student_id),
  foreign key (academy_id, guardian_id) references public.guardians (academy_id, id) on delete cascade,
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete cascade
);

create index guardian_students_student_idx on public.guardian_students (student_id);

-- ---------------------------------------------------------------------
-- ¿Este alumno es mío? (mi propia ficha o la de alguien a quien tutoreo)
-- ---------------------------------------------------------------------

create or replace function public.is_my_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and s.profile_id = auth.uid())
      or exists (select 1 from public.guardian_students gs
                 join public.guardians g on g.id = gs.guardian_id
                 where gs.student_id = p_student_id and g.profile_id = auth.uid());
$$;

-- ¿Puedo reservar y cancelar por este alumno?
create or replace function public.can_book_for(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and s.profile_id = auth.uid())
      or exists (select 1 from public.guardian_students gs
                 join public.guardians g on g.id = gs.guardian_id
                 where gs.student_id = p_student_id and g.profile_id = auth.uid() and gs.can_book);
$$;

-- Los alumnos que puedo manejar desde mi celular: yo (si tengo ficha) y los que tutoreo.
create or replace function public.my_students()
returns table (student_id uuid, full_name text, first_name text, is_self boolean, can_book boolean)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, trim(s.first_name || ' ' || s.last_name), s.first_name, true, true
  from public.students s
  where s.academy_id = public.current_academy_id() and s.profile_id = auth.uid()
  union all
  select s.id, trim(s.first_name || ' ' || s.last_name), s.first_name, false, gs.can_book
  from public.guardian_students gs
  join public.guardians g on g.id = gs.guardian_id
  join public.students s on s.id = gs.student_id
  where g.profile_id = auth.uid() and g.academy_id = public.current_academy_id()
    and s.profile_id is distinct from auth.uid()
  order by 4 desc, 2;
$$;

-- ---------------------------------------------------------------------
-- Vincular y desvincular (recepción)
-- ---------------------------------------------------------------------

create or replace function public.link_guardian(p_student_id uuid, p_email text, p_relationship text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy  uuid := public.current_academy_id();
  v_profile  uuid;
  v_guardian uuid;
  v_role     uuid;
  v_link     uuid;
begin
  if v_academy is null or not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para vincular tutores.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and academy_id = v_academy) then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  if p_relationship is not null and p_relationship not in ('madre', 'padre', 'tutor') then
    raise exception 'Elegí madre, padre o tutor.' using errcode = '22023';
  end if;
  select id into v_profile from public.profiles
   where academy_id = v_academy and lower(email) = lower(trim(coalesce(p_email, '')));
  if v_profile is null then
    raise exception 'No hay ninguna cuenta con ese email. Pedile al tutor que se registre en la app con ese email.'
      using errcode = 'P0002', hint = 'sin-cuenta';
  end if;
  if exists (select 1 from public.students where id = p_student_id and profile_id = v_profile) then
    raise exception 'Esa cuenta es la del propio alumno.' using errcode = '22023', hint = 'mismo';
  end if;

  insert into public.guardians (academy_id, profile_id) values (v_academy, v_profile)
  on conflict (academy_id, profile_id) do nothing;
  select id into v_guardian from public.guardians where academy_id = v_academy and profile_id = v_profile;

  insert into public.guardian_students (academy_id, guardian_id, student_id, relationship, is_primary)
  values (v_academy, v_guardian, p_student_id, p_relationship,
          not exists (select 1 from public.guardian_students where student_id = p_student_id))
  on conflict (guardian_id, student_id) do update set relationship = coalesce(excluded.relationship, public.guardian_students.relationship)
  returning id into v_link;

  -- Rol de tutor (sin pasar por el permiso de roles: lo da la vinculación).
  select id into v_role from public.roles where academy_id = v_academy and code = 'guardian';
  if v_role is not null then
    insert into public.user_roles (academy_id, profile_id, role_id, granted_by)
    values (v_academy, v_profile, v_role, auth.uid())
    on conflict (profile_id, role_id) do nothing;
  end if;
  return v_link;
end;
$$;

create or replace function public.unlink_guardian(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_guardian uuid;
  v_profile uuid;
begin
  if v_academy is null or not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para desvincular tutores.' using errcode = '42501';
  end if;
  delete from public.guardian_students where id = p_link_id and academy_id = v_academy returning guardian_id into v_guardian;
  if v_guardian is null then
    raise exception 'Ese vínculo ya no existe.' using errcode = 'P0002';
  end if;
  -- Sin más alumnos a cargo, deja de ser tutor.
  if not exists (select 1 from public.guardian_students where guardian_id = v_guardian) then
    select profile_id into v_profile from public.guardians where id = v_guardian;
    delete from public.user_roles ur using public.roles r
     where ur.role_id = r.id and r.code = 'guardian' and ur.profile_id = v_profile and r.academy_id = v_academy;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Lo del alumno, también para su tutor
-- ---------------------------------------------------------------------

-- Pase QR: el propio o el de un alumno a cargo.
drop function if exists public.my_access_key();
create or replace function public.my_access_key(p_student_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_student uuid;
  v_secret  bytea;
begin
  if p_student_id is null then
    select id into v_student from public.students where academy_id = v_academy and profile_id = auth.uid();
  elsif public.is_my_student(p_student_id) then
    v_student := p_student_id;
  end if;
  if v_student is null then
    raise exception 'Tu cuenta no tiene ficha de alumno.' using errcode = 'P0002';
  end if;
  insert into public.student_access_keys (student_id, academy_id, secret)
  values (v_student, v_academy, gen_random_bytes(32))
  on conflict (student_id) do nothing;
  select secret into v_secret from public.student_access_keys where student_id = v_student;
  return jsonb_build_object('student_id', v_student, 'secret', encode(v_secret, 'hex'));
end;
$$;

-- Reservar: el alumno para sí, su tutor (si puede reservar) o recepción.
create or replace function public.resolve_booking_student(p_academy uuid, p_student_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_student_id is null then
    select id into v_id from public.students where academy_id = p_academy and profile_id = auth.uid();
    if v_id is null then
      raise exception 'Tu cuenta no tiene ficha de alumno.' using errcode = 'P0002';
    end if;
    return v_id;
  end if;
  select id into v_id from public.students where id = p_student_id and academy_id = p_academy;
  if v_id is null then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  if not public.can_book_for(v_id) and not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para reservar por otra persona.' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_b public.bookings;
  v_start timestamptz;
  v_hours integer;
begin
  select * into v_b from public.bookings where id = p_booking_id and academy_id = v_academy and status = 'confirmed' for update;
  if not found then
    raise exception 'Esa reserva ya estaba cancelada.' using errcode = 'P0002';
  end if;
  if not public.can_book_for(v_b.student_id) and not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para cancelar esa reserva.' using errcode = '42501';
  end if;
  select starts_at into v_start from public.class_sessions where id = v_b.session_id;
  if v_start <= now() then
    raise exception 'Esa clase ya empezó.' using errcode = 'P0001';
  end if;
  v_hours := coalesce(public.setting(v_academy, 'cancel_hours'), 12);
  if now() <= v_start - make_interval(hours => v_hours) then
    perform public.refund_booking_unit(v_b, 'Cancelada a tiempo');
    return true;
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancel_note = 'Cancelada con menos de 12 h'
   where id = p_booking_id;
  return false;
end;
$$;

-- Políticas de lectura: "lo mío" pasa a incluir a los alumnos a cargo.
drop policy "Mi ficha, o todas si veo personas" on public.students;
create policy "Mi ficha y las de mis alumnos a cargo, o todas si veo personas" on public.students
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_my_student(id)
    or (academy_id = public.current_academy_id() and public.has_permission('people.view'))
  );

drop policy "Mis cuotas, o todas si veo personas" on public.memberships;
create policy "Mis cuotas, o todas si veo personas" on public.memberships
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id() and public.has_permission('people.view')));

drop policy "Mis horarios fijos, o todos si veo personas" on public.enrollments;
create policy "Mis horarios fijos, o todos si veo personas" on public.enrollments
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id() and public.has_permission('people.view')));

drop policy "Mis cargos, o todos si cobro" on public.charges;
create policy "Mis cargos, o todos si cobro" on public.charges
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id()
             and (public.has_permission('payments.register') or public.has_permission('finance.view'))));

drop policy "Mis pagos, o todos si cobro" on public.payments;
create policy "Mis pagos, o todos si cobro" on public.payments
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id()
             and (public.has_permission('payments.register') or public.has_permission('finance.view'))));

drop policy "Mis inscripciones, o todas si cobro" on public.workshop_registrations;
create policy "Mis inscripciones, o todas si cobro" on public.workshop_registrations
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id()
             and (public.has_permission('payments.register') or public.has_permission('people.view'))));

drop policy "Mis devoluciones, o todas si cobro" on public.refunds;
create policy "Mis devoluciones, o todas si cobro" on public.refunds
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id()
             and (public.has_permission('payments.register') or public.has_permission('finance.view'))));

drop policy "Mis saldos, o todos si veo personas" on public.class_balances;
create policy "Mis saldos, o todos si veo personas" on public.class_balances
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id() and public.has_permission('people.view')));

drop policy "Mis reservas, o todas si veo personas o listas" on public.bookings;
create policy "Mis reservas, o todas si veo personas o listas" on public.bookings
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id()
             and (public.has_permission('people.view') or public.has_permission('classes.view_roster'))));

drop policy "Mis asistencias, o todas si veo personas" on public.attendances;
create policy "Mis asistencias, o todas si veo personas" on public.attendances
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id() and public.has_permission('people.view')));

-- ---------------------------------------------------------------------
-- Auditoría y seguridad
-- ---------------------------------------------------------------------

create trigger guardians_audit after insert or update or delete on public.guardians
  for each row execute function public.write_audit_log();
create trigger guardian_students_audit after insert or update or delete on public.guardian_students
  for each row execute function public.write_audit_log();

alter table public.guardians         enable row level security;
alter table public.guardian_students enable row level security;
revoke all on public.guardians, public.guardian_students from anon, authenticated;
grant select on public.guardians, public.guardian_students to authenticated;

create policy "Soy yo, o veo personas" on public.guardians
  for select to authenticated
  using (profile_id = (select auth.uid())
         or (academy_id = public.current_academy_id() and public.has_permission('people.view')));
create policy "Mis vínculos, o todos si veo personas" on public.guardian_students
  for select to authenticated
  using (exists (select 1 from public.guardians g where g.id = guardian_id and g.profile_id = (select auth.uid()))
         or (academy_id = public.current_academy_id() and public.has_permission('people.view')));

revoke all on function public.is_my_student(uuid) from public, anon;
revoke all on function public.can_book_for(uuid) from public, anon;
revoke all on function public.my_students() from public, anon;
revoke all on function public.link_guardian(uuid, text, text) from public, anon;
revoke all on function public.unlink_guardian(uuid) from public, anon;
revoke all on function public.my_access_key(uuid) from public, anon;
grant execute on function public.is_my_student(uuid) to authenticated;
grant execute on function public.can_book_for(uuid) to authenticated;
grant execute on function public.my_students() to authenticated;
grant execute on function public.link_guardian(uuid, text, text) to authenticated;
grant execute on function public.unlink_guardian(uuid) to authenticated;
grant execute on function public.my_access_key(uuid) to authenticated;
