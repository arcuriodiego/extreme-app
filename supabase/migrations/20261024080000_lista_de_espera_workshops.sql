-- Lista de espera de workshops (decisiones de Diego, 24 oct).
--
-- - Con el workshop completo, recepción anota a cualquiera (alumno o alguien de afuera, a
--   quien se le crea la ficha Ocasional) y el alumno (o su tutor) se puede anotar desde la app.
-- - Si se libera un lugar, se le guarda al primero de la lista durante workshop_offer_hours (24 h),
--   o hasta que empiece el workshop si falta menos. Se le avisa en la app (si tiene cuenta o tutor)
--   y recepción lo ve para llamarlo. Tiene que pagar el total en recepción para quedar inscripto.
-- - Si no paga a tiempo o avisa que no puede, el lugar pasa al siguiente.

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in (
  'grace_days', 'suspension_alert_days', 'due_reminder_days', 'cancel_hours', 'credit_days',
  'credit_class_window_days', 'booking_hold_minutes', 'session_generation_weeks',
  'checkin_before_minutes', 'checkin_after_minutes',
  'workshop_offer_hours'   -- workshops: horas que se guarda un lugar liberado al primero de la lista
));

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
    (p_academy_id, 'session_generation_weeks', 8),
    (p_academy_id, 'checkin_before_minutes', 30),
    (p_academy_id, 'checkin_after_minutes', 15),
    (p_academy_id, 'workshop_offer_hours', 24)
  on conflict (academy_id, key) do nothing;
$$;

select public.seed_default_settings(id) from public.academies;

-- ---------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------

create table public.workshop_waitlist (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete restrict,
  workshop_id       uuid not null,
  student_id        uuid not null,
  status            text not null default 'waiting'
                    check (status in ('waiting', 'offered', 'enrolled', 'declined', 'expired', 'cancelled', 'closed')),
  offered_at        timestamptz,
  offer_expires_at  timestamptz,
  registration_id   uuid,
  created_by        uuid default public.current_actor_id(),
  created_at        timestamptz not null default clock_timestamp(),  -- orden de llegada exacto
  updated_at        timestamptz not null default now(),
  check (status <> 'offered' or offer_expires_at is not null),
  foreign key (academy_id, workshop_id) references public.workshops (academy_id, id) on delete cascade,
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete cascade
);

create unique index workshop_waitlist_active_key on public.workshop_waitlist (workshop_id, student_id) where status in ('waiting', 'offered');
create index workshop_waitlist_order_idx on public.workshop_waitlist (workshop_id, created_at) where status in ('waiting', 'offered');

create trigger workshop_waitlist_touch before update on public.workshop_waitlist for each row execute function public.touch_updated_at();
create trigger workshop_waitlist_audit after insert or update or delete on public.workshop_waitlist for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------
-- Cupo: inscriptos y lugares guardados
-- ---------------------------------------------------------------------

drop function if exists public.workshop_taken_counts();
create or replace function public.workshop_taken_counts()
returns table (workshop_id uuid, taken integer, held integer)
language sql
stable
security definer
set search_path = public
as $$
  select w.id,
         (select count(*)::integer from public.workshop_registrations r where r.workshop_id = w.id and r.status = 'confirmed'),
         (select count(*)::integer from public.workshop_waitlist l
           where l.workshop_id = w.id and l.status = 'offered' and l.offer_expires_at > now())
  from public.workshops w
  where w.academy_id = public.current_academy_id();
$$;

-- Inscribir: los lugares guardados para otros de la lista no se pueden tomar.
-- Si la persona estaba en la lista, su anotación queda como inscripta.
create or replace function public.register_workshop(p_workshop_id uuid, p_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_w public.workshops;
  v_taken integer;
  v_held integer;
  v_charge uuid;
  v_reg uuid;
  v_today date := public.academy_today(v_academy);
begin
  select * into v_w from public.workshops where id = p_workshop_id and academy_id = v_academy for update;
  if not found then
    raise exception 'No encontramos ese workshop.' using errcode = 'P0002';
  end if;
  if v_w.status <> 'published' then
    raise exception 'Ese workshop no está abierto a inscripciones.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.workshop_sessions where workshop_id = p_workshop_id and starts_at > now()) then
    raise exception 'Ese workshop ya empezó o no tiene fechas.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and academy_id = v_academy) then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.workshop_registrations
             where workshop_id = p_workshop_id and student_id = p_student_id and status = 'confirmed') then
    raise exception 'Ya está inscripto en ese workshop.' using errcode = '23505';
  end if;
  select count(*) into v_taken from public.workshop_registrations where workshop_id = p_workshop_id and status = 'confirmed';
  select count(*) into v_held from public.workshop_waitlist
   where workshop_id = p_workshop_id and status = 'offered' and offer_expires_at > now() and student_id <> p_student_id;
  if v_taken + v_held >= v_w.capacity then
    raise exception 'No hay lugar: el workshop está completo.' using errcode = 'P0001';
  end if;

  insert into public.charges (academy_id, student_id, concept, due_date, description, amount_cents)
  values (v_academy, p_student_id, 'workshop', v_today, left('Workshop · ' || v_w.title, 200), v_w.price_cents)
  returning id into v_charge;
  insert into public.workshop_registrations (academy_id, workshop_id, student_id, charge_id)
  values (v_academy, p_workshop_id, p_student_id, v_charge)
  returning id into v_reg;
  update public.workshop_waitlist set status = 'enrolled', registration_id = v_reg
   where workshop_id = p_workshop_id and student_id = p_student_id and status in ('waiting', 'offered');
  return v_reg;
end;
$$;

-- ---------------------------------------------------------------------
-- Mover la lista (uso interno)
-- ---------------------------------------------------------------------

create or replace function public.refresh_workshop_waitlist(p_workshop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w     public.workshops;
  v_first timestamptz;
  v_hours integer;
  v_tz    text;
  v_free  integer;
  v_e     public.workshop_waitlist;
  v_until timestamptz;
begin
  select * into v_w from public.workshops where id = p_workshop_id for update;
  if not found then return; end if;
  select min(starts_at) into v_first from public.workshop_sessions where workshop_id = p_workshop_id;
  v_hours := coalesce(public.setting(v_w.academy_id, 'workshop_offer_hours'), 24);
  v_tz := (select timezone from public.academies where id = v_w.academy_id);

  update public.workshop_waitlist set status = 'expired'
   where workshop_id = p_workshop_id and status = 'offered' and offer_expires_at <= now();

  if v_w.status <> 'published' or v_first is null or v_first <= now() then
    update public.workshop_waitlist set status = 'closed' where workshop_id = p_workshop_id and status in ('waiting', 'offered');
    return;
  end if;

  select v_w.capacity
         - (select count(*) from public.workshop_registrations where workshop_id = p_workshop_id and status = 'confirmed')
         - (select count(*) from public.workshop_waitlist where workshop_id = p_workshop_id and status = 'offered' and offer_expires_at > now())
    into v_free;

  while v_free > 0 loop
    select * into v_e from public.workshop_waitlist
     where workshop_id = p_workshop_id and status = 'waiting' order by created_at limit 1 for update;
    exit when not found;
    v_until := least(now() + make_interval(hours => v_hours), v_first);
    update public.workshop_waitlist set status = 'offered', offered_at = now(), offer_expires_at = v_until where id = v_e.id;
    perform public.notify_student(v_w.academy_id, v_e.student_id, 'waitlist_offer',
      'Se liberó un lugar en el workshop ' || v_w.title,
      'Se liberó un lugar para ' || (select first_name from public.students where id = v_e.student_id) || ' en el workshop ' || v_w.title,
      'Te lo guardamos hasta el ' || public.short_day((v_until at time zone v_tz)::date) || ' a las '
        || to_char(v_until at time zone v_tz, 'HH24:MI') || '. Para quedarte con el lugar, pagá ' || public.ars(v_w.price_cents)
        || ' en recepción antes de esa hora.',
      'Se lo guardamos hasta el ' || public.short_day((v_until at time zone v_tz)::date) || ' a las '
        || to_char(v_until at time zone v_tz, 'HH24:MI') || '. Para quedarse con el lugar, hay que pagar ' || public.ars(v_w.price_cents)
        || ' en recepción antes de esa hora.',
      '/clases', 'espera-workshop:' || v_e.id);
    v_free := v_free - 1;
  end loop;
end;
$$;

create or replace function public.refresh_workshop_waitlists()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in
    select distinct l.workshop_id from public.workshop_waitlist l
    where l.academy_id = public.current_academy_id() and l.status in ('waiting', 'offered')
  loop
    perform public.refresh_workshop_waitlist(r.workshop_id);
  end loop;
end;
$$;

-- Al cancelarse una inscripción (o al subir el cupo), el lugar se ofrece enseguida.
create or replace function public.workshop_registrations_offer_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status = 'confirmed' then
    perform public.refresh_workshop_waitlist(new.workshop_id);
  end if;
  return null;
end;
$$;

create trigger workshop_registrations_offer_seat after update of status on public.workshop_registrations
  for each row execute function public.workshop_registrations_offer_seat();

create or replace function public.workshops_capacity_offer_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.capacity > old.capacity then
    perform public.refresh_workshop_waitlist(new.id);
  end if;
  return null;
end;
$$;

create trigger workshops_capacity_offer_seat after update of capacity on public.workshops
  for each row execute function public.workshops_capacity_offer_seat();

-- ---------------------------------------------------------------------
-- Anotarse, salir
-- ---------------------------------------------------------------------

create or replace function public.join_workshop_waitlist(p_workshop_id uuid, p_student_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_student uuid;
  v_w public.workshops;
  v_taken integer;
  v_held integer;
begin
  if v_academy is null then
    raise exception 'Sesión inválida.' using errcode = '42501';
  end if;
  if p_student_id is null then
    select id into v_student from public.students where academy_id = v_academy and profile_id = auth.uid();
    if v_student is null then
      raise exception 'Tu cuenta no tiene ficha de alumno.' using errcode = 'P0002';
    end if;
  else
    v_student := p_student_id;
    if not exists (select 1 from public.students where id = v_student and academy_id = v_academy) then
      raise exception 'No encontramos al alumno.' using errcode = 'P0002';
    end if;
    if not public.can_book_for(v_student) and not public.has_permission('people.manage') then
      raise exception 'No tenés permiso para anotar a otra persona.' using errcode = '42501';
    end if;
  end if;

  perform public.refresh_workshop_waitlist(p_workshop_id);
  select * into v_w from public.workshops where id = p_workshop_id and academy_id = v_academy for update;
  if not found or v_w.status <> 'published' then
    raise exception 'Ese workshop no está abierto a inscripciones.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.workshop_sessions where workshop_id = p_workshop_id and starts_at > now())
     or exists (select 1 from public.workshop_sessions where workshop_id = p_workshop_id and starts_at <= now()) then
    raise exception 'Ese workshop ya empezó o no tiene fechas.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.workshop_registrations where workshop_id = p_workshop_id and student_id = v_student and status = 'confirmed') then
    raise exception 'Ya está inscripto en ese workshop.' using errcode = '23505';
  end if;
  if exists (select 1 from public.workshop_waitlist where workshop_id = p_workshop_id and student_id = v_student and status in ('waiting', 'offered')) then
    raise exception 'Ya está en la lista de espera de ese workshop.' using errcode = '23505';
  end if;
  select count(*) into v_taken from public.workshop_registrations where workshop_id = p_workshop_id and status = 'confirmed';
  select count(*) into v_held from public.workshop_waitlist where workshop_id = p_workshop_id and status = 'offered' and offer_expires_at > now();
  if v_taken + v_held < v_w.capacity then
    raise exception 'Hay lugar: se puede inscribir directamente en recepción.' using errcode = 'P0001';
  end if;

  insert into public.workshop_waitlist (academy_id, workshop_id, student_id) values (v_academy, p_workshop_id, v_student);
  return (select count(*) from public.workshop_waitlist where workshop_id = p_workshop_id and status in ('waiting', 'offered'));
end;
$$;

-- Recepción anota a alguien de afuera: se usa su ficha (mismo DNI) o se le crea una Ocasional.
create or replace function public.join_workshop_waitlist_guest(
  p_workshop_id uuid, p_first_name text, p_last_name text, p_phone text, p_dni text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_student uuid;
  v_dni text := nullif(upper(regexp_replace(coalesce(p_dni, ''), '[.\s-]', '', 'g')), '');
begin
  if v_academy is null or not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para anotar en la lista.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_first_name, ''))) = 0 then
    raise exception 'Escribí el nombre.' using errcode = '22023';
  end if;
  if v_dni is not null then
    select id into v_student from public.students where academy_id = v_academy and upper(dni) = v_dni;
  end if;
  if v_student is null then
    insert into public.students (academy_id, first_name, last_name, phone, dni, status)
    values (v_academy, left(trim(p_first_name), 80), left(trim(coalesce(p_last_name, '')), 80),
            nullif(trim(coalesce(p_phone, '')), ''), v_dni, 'occasional')
    returning id into v_student;
  end if;
  return public.join_workshop_waitlist(p_workshop_id, v_student);
end;
$$;

-- Salir de la lista o dejar el lugar guardado: pasa al siguiente.
create or replace function public.leave_workshop_waitlist(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_e public.workshop_waitlist;
begin
  select * into v_e from public.workshop_waitlist
   where id = p_entry_id and academy_id = public.current_academy_id() and status in ('waiting', 'offered') for update;
  if not found then
    raise exception 'Ya no está en esa lista de espera.' using errcode = 'P0002';
  end if;
  if not public.can_book_for(v_e.student_id) and not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para hacer esto.' using errcode = '42501';
  end if;
  update public.workshop_waitlist set status = case when v_e.status = 'offered' then 'declined' else 'cancelled' end
   where id = p_entry_id;
  perform public.refresh_workshop_waitlist(v_e.workshop_id);
end;
$$;

-- Lista de un workshop, en orden (personal), o mis anotaciones (alumno/tutor), con el puesto.
create or replace function public.workshop_waitlist_view(p_workshop_id uuid default null)
returns table (entry_id uuid, workshop_id uuid, student_id uuid, full_name text, phone text, status text,
               offer_expires_at timestamptz, queue_position integer)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.workshop_id, l.student_id, trim(s.first_name || ' ' || s.last_name),
         case when public.has_permission('people.view') then coalesce(s.phone, p.phone) end,
         l.status, l.offer_expires_at,
         (select count(*)::integer from public.workshop_waitlist l2
           where l2.workshop_id = l.workshop_id and l2.status in ('waiting', 'offered') and l2.created_at <= l.created_at)
  from public.workshop_waitlist l
  join public.students s on s.id = l.student_id
  left join public.profiles p on p.id = s.profile_id
  where l.academy_id = public.current_academy_id() and l.status in ('waiting', 'offered')
    and (p_workshop_id is null or l.workshop_id = p_workshop_id)
    and (public.has_permission('people.view') or public.is_my_student(l.student_id))
  order by l.workshop_id, l.created_at;
$$;

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------

alter table public.workshop_waitlist enable row level security;
revoke all on public.workshop_waitlist from anon, authenticated;
grant select on public.workshop_waitlist to authenticated;
create policy "Mis listas de espera, o todas si veo personas" on public.workshop_waitlist
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id() and public.has_permission('people.view')));

revoke all on function public.refresh_workshop_waitlist(uuid) from public, anon, authenticated;
revoke all on function public.workshop_registrations_offer_seat() from public, anon, authenticated;
revoke all on function public.workshops_capacity_offer_seat() from public, anon, authenticated;
revoke all on function public.workshop_taken_counts() from public, anon;
revoke all on function public.refresh_workshop_waitlists() from public, anon;
revoke all on function public.join_workshop_waitlist(uuid, uuid) from public, anon;
revoke all on function public.join_workshop_waitlist_guest(uuid, text, text, text, text) from public, anon;
revoke all on function public.leave_workshop_waitlist(uuid) from public, anon;
revoke all on function public.workshop_waitlist_view(uuid) from public, anon;
grant execute on function public.workshop_taken_counts() to authenticated;
grant execute on function public.refresh_workshop_waitlists() to authenticated;
grant execute on function public.join_workshop_waitlist(uuid, uuid) to authenticated;
grant execute on function public.join_workshop_waitlist_guest(uuid, text, text, text, text) to authenticated;
grant execute on function public.leave_workshop_waitlist(uuid) to authenticated;
grant execute on function public.workshop_waitlist_view(uuid) to authenticated;
