-- =====================================================================
-- Migración 0008 · Cuota de profe
-- Inscripciones (memberships) y plazas fijas en horarios semanales
-- (enrollments), con control de cupo dentro de la base.
-- El vencimiento (anchor_day) se fija con el primer pago, en la entrega de pagos.
-- =====================================================================

create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete restrict,
  student_id       uuid not null,
  plan_id          uuid not null,
  teacher_id       uuid not null,
  age_category_id  uuid not null,
  anchor_day       smallint check (anchor_day between 1 and 31), -- día del primer pago; vacío hasta pagar
  status           text not null default 'active' check (status in ('active', 'ended')),
  started_on       date not null default current_date,
  ended_on         date,
  ended_reason     text check (length(ended_reason) <= 200),
  created_by       uuid default public.current_actor_id(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (academy_id, id),
  check ((status = 'ended') = (ended_on is not null)),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict,
  foreign key (academy_id, plan_id) references public.plans (academy_id, id) on delete restrict,
  foreign key (academy_id, teacher_id) references public.teachers (academy_id, id) on delete restrict,
  foreign key (academy_id, age_category_id) references public.age_categories (academy_id, id) on delete restrict
);

create index memberships_student_idx on public.memberships (student_id, status);

create table public.enrollments (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete restrict,
  membership_id  uuid not null,
  student_id     uuid not null,
  schedule_id    uuid not null,
  status         text not null default 'active' check (status in ('active', 'ended')),
  starts_on      date not null default current_date,
  ends_on        date,
  created_by     uuid default public.current_actor_id(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((status = 'ended') = (ends_on is not null)),
  foreign key (academy_id, membership_id) references public.memberships (academy_id, id) on delete restrict,
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict,
  -- Un horario con alumnos (aunque ya terminados) no se borra: queda el historial.
  foreign key (academy_id, schedule_id) references public.class_schedules (academy_id, id) on delete restrict
);

-- Un alumno no puede tener dos plazas fijas activas en el mismo horario.
create unique index enrollments_active_key on public.enrollments (student_id, schedule_id) where status = 'active';
create index enrollments_schedule_idx on public.enrollments (schedule_id) where status = 'active';

-- ---------------------------------------------------------------------
-- Cupo
-- ---------------------------------------------------------------------

-- Plazas fijas activas por horario. Todos en la academia lo pueden consultar
-- (para mostrar lugares libres) sin ver quiénes son.
create or replace function public.schedule_fixed_counts()
returns table (schedule_id uuid, fixed integer)
language sql
stable
security definer
set search_path = public
as $$
  select e.schedule_id, count(*)::integer
  from public.enrollments e
  where e.academy_id = public.current_academy_id() and e.status = 'active'
  group by e.schedule_id;
$$;

-- Verifica que un horario sirva para una cuota (profe y categoría) y tenga lugar.
-- Bloquea el grupo para que dos inscripciones simultáneas no se pasen del cupo.
create or replace function public.assert_schedule_available(
  p_academy uuid, p_schedule_id uuid, p_teacher_id uuid, p_age_category_id uuid, p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.class_groups;
  v_schedule public.class_schedules;
  v_today date := (now() at time zone (select timezone from public.academies where id = p_academy))::date;
  v_taken integer;
begin
  select * into v_schedule from public.class_schedules where id = p_schedule_id and academy_id = p_academy;
  if not found or (v_schedule.valid_to is not null and v_schedule.valid_to < v_today) then
    raise exception 'Ese horario ya no existe.' using errcode = 'P0002';
  end if;

  select * into v_group from public.class_groups where id = v_schedule.group_id for update;
  if v_group.status <> 'active' or v_group.teacher_id is distinct from p_teacher_id
     or v_group.age_category_id <> p_age_category_id then
    raise exception 'Ese horario no es de ese profe y categoría.' using errcode = '22023';
  end if;

  if exists (select 1 from public.enrollments
             where student_id = p_student_id and schedule_id = p_schedule_id and status = 'active') then
    raise exception 'El alumno ya tiene ese horario fijo.' using errcode = '23505';
  end if;

  select count(*) into v_taken from public.enrollments where schedule_id = p_schedule_id and status = 'active';
  if v_taken >= v_group.capacity then
    raise exception 'No hay lugar: ese horario está completo.' using errcode = 'P0001', hint = 'full';
  end if;
end;
$$;

create or replace function public.require_people_manage()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if v_academy is null or not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para inscribir alumnos.' using errcode = '42501';
  end if;
  return v_academy;
end;
$$;

-- ---------------------------------------------------------------------
-- Acciones de recepción
-- ---------------------------------------------------------------------

create or replace function public.enroll_teacher_monthly(
  p_student_id uuid, p_teacher_id uuid, p_age_category_id uuid, p_schedule_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_people_manage();
  v_plan public.plans;
  v_membership uuid;
  v_schedule uuid;
  v_n integer := coalesce(array_length(p_schedule_ids, 1), 0);
begin
  if not exists (select 1 from public.students where id = p_student_id and academy_id = v_academy) then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  select * into v_plan from public.plans where academy_id = v_academy and kind = 'teacher_monthly' and active
   order by sort_order limit 1;
  if not found then
    raise exception 'No hay un plan de cuota de profe activo.' using errcode = 'P0002';
  end if;
  if v_n <> v_plan.classes_per_week or (select count(distinct x) from unnest(p_schedule_ids) x) <> v_n then
    raise exception 'Elegí % horarios distintos.', v_plan.classes_per_week using errcode = '22023';
  end if;

  -- Bloqueos siempre en el mismo orden para evitar esperas cruzadas.
  for v_schedule in select x from unnest(p_schedule_ids) x order by x loop
    perform public.assert_schedule_available(v_academy, v_schedule, p_teacher_id, p_age_category_id, p_student_id);
  end loop;

  insert into public.memberships (academy_id, student_id, plan_id, teacher_id, age_category_id)
  values (v_academy, p_student_id, v_plan.id, p_teacher_id, p_age_category_id)
  returning id into v_membership;

  insert into public.enrollments (academy_id, membership_id, student_id, schedule_id)
  select v_academy, v_membership, p_student_id, x from unnest(p_schedule_ids) x;

  return v_membership;
end;
$$;

create or replace function public.change_enrollment(p_enrollment_id uuid, p_new_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_people_manage();
  v_enrollment public.enrollments;
  v_membership public.memberships;
  v_today date;
begin
  select * into v_enrollment from public.enrollments
   where id = p_enrollment_id and academy_id = v_academy and status = 'active' for update;
  if not found then
    raise exception 'Ese horario fijo ya no está activo.' using errcode = 'P0002';
  end if;
  if v_enrollment.schedule_id = p_new_schedule_id then
    return;
  end if;
  select * into v_membership from public.memberships where id = v_enrollment.membership_id;

  perform public.assert_schedule_available(v_academy, p_new_schedule_id, v_membership.teacher_id,
                                           v_membership.age_category_id, v_enrollment.student_id);

  v_today := (now() at time zone (select timezone from public.academies where id = v_academy))::date;
  update public.enrollments set status = 'ended', ends_on = v_today where id = p_enrollment_id;
  insert into public.enrollments (academy_id, membership_id, student_id, schedule_id)
  values (v_academy, v_enrollment.membership_id, v_enrollment.student_id, p_new_schedule_id);
end;
$$;

create or replace function public.end_membership(p_membership_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_people_manage();
  v_today date := (now() at time zone (select timezone from public.academies where id = v_academy))::date;
begin
  update public.memberships
     set status = 'ended', ended_on = v_today, ended_reason = nullif(left(trim(coalesce(p_reason, '')), 200), '')
   where id = p_membership_id and academy_id = v_academy and status = 'active';
  if not found then
    raise exception 'Esa cuota ya no está activa.' using errcode = 'P0002';
  end if;
  update public.enrollments set status = 'ended', ends_on = v_today
   where membership_id = p_membership_id and status = 'active';
end;
$$;

-- No se cierra un grupo que todavía tiene alumnos fijos.
create or replace function public.block_closing_group_with_students()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'closed' and old.status <> 'closed' and exists (
    select 1 from public.enrollments e join public.class_schedules s on s.id = e.schedule_id
    where s.group_id = new.id and e.status = 'active'
  ) then
    raise exception 'Ese grupo tiene alumnos fijos: primero cambiales el horario o dales de baja.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger class_groups_block_close before update of status on public.class_groups
  for each row execute function public.block_closing_group_with_students();

-- Quitar un horario: si nunca tuvo alumnos fijos se borra; si tuvo, se da por
-- terminado ayer para conservar el historial. Con alumnos fijos activos, no se puede.
create or replace function public.remove_schedule(p_schedule_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_yesterday date;
begin
  if v_academy is null or not public.has_permission('classes.manage') then
    raise exception 'No tenés permiso para cambiar la grilla.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.class_schedules where id = p_schedule_id and academy_id = v_academy) then
    raise exception 'Ese horario ya no existe.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.enrollments where schedule_id = p_schedule_id and status = 'active') then
    raise exception 'Ese horario tiene alumnos fijos: primero cambiales el horario o dales de baja.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.enrollments where schedule_id = p_schedule_id) then
    delete from public.class_schedules where id = p_schedule_id;
    return 'deleted';
  end if;
  v_yesterday := (now() at time zone (select timezone from public.academies where id = v_academy))::date - 1;
  update public.class_schedules
     set valid_from = least(valid_from, v_yesterday), valid_to = v_yesterday
   where id = p_schedule_id;
  return 'ended';
end;
$$;

-- ---------------------------------------------------------------------
-- Fecha de actualización, auditoría y seguridad
-- ---------------------------------------------------------------------

create trigger memberships_touch before update on public.memberships for each row execute function public.touch_updated_at();
create trigger enrollments_touch before update on public.enrollments for each row execute function public.touch_updated_at();
create trigger memberships_audit after insert or update or delete on public.memberships for each row execute function public.write_audit_log();
create trigger enrollments_audit after insert or update or delete on public.enrollments for each row execute function public.write_audit_log();

alter table public.memberships enable row level security;
alter table public.enrollments enable row level security;

revoke all on public.memberships, public.enrollments from anon, authenticated;
grant select on public.memberships, public.enrollments to authenticated;

create policy "Mis cuotas, o todas si veo personas" on public.memberships
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    or (academy_id = public.current_academy_id() and public.has_permission('people.view'))
  );
create policy "Mis horarios fijos, o todos si veo personas" on public.enrollments
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    or (academy_id = public.current_academy_id() and public.has_permission('people.view'))
  );

revoke all on function public.schedule_fixed_counts() from public, anon;
grant execute on function public.schedule_fixed_counts() to authenticated;
revoke all on function public.enroll_teacher_monthly(uuid, uuid, uuid, uuid[]) from public, anon;
revoke all on function public.change_enrollment(uuid, uuid) from public, anon;
revoke all on function public.end_membership(uuid, text) from public, anon;
grant execute on function public.enroll_teacher_monthly(uuid, uuid, uuid, uuid[]) to authenticated;
grant execute on function public.change_enrollment(uuid, uuid) to authenticated;
grant execute on function public.end_membership(uuid, text) to authenticated;
revoke all on function public.remove_schedule(uuid) from public, anon;
grant execute on function public.remove_schedule(uuid) to authenticated;
revoke all on function public.assert_schedule_available(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.require_people_manage() from public, anon, authenticated;
revoke all on function public.block_closing_group_with_students() from public, anon, authenticated;
