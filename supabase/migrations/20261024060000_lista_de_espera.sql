-- Entrega 16 · Lista de espera.
--
-- - Con la clase completa, un alumno con pack o crédito (o su tutor, o recepción) se anota.
-- - Cuando se libera un lugar, se le ofrece al primero de la lista: el lugar queda guardado
--   para él (nadie más lo puede reservar) y tiene un plazo para confirmarlo:
--   waitlist_offer_minutes (120), y como mucho hasta waitlist_cutoff_minutes (30) antes del inicio.
-- - Si confirma, se reserva con su pack o crédito como cualquier reserva. Si no confirma a
--   tiempo o lo rechaza, el lugar pasa al siguiente.
-- - waitlist_cutoff_minutes antes del inicio la lista se cierra.
-- - Los vencimientos se procesan cuando alguien abre Clases, Mis pases o el Calendario
--   (y cada vez que se cancela una reserva), igual que la generación diaria.

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in (
  'grace_days', 'suspension_alert_days', 'due_reminder_days', 'cancel_hours', 'credit_days',
  'credit_class_window_days', 'booking_hold_minutes', 'session_generation_weeks',
  'checkin_before_minutes', 'checkin_after_minutes',
  'waitlist_offer_minutes',   -- tiempo para confirmar un lugar liberado
  'waitlist_cutoff_minutes'   -- cuánto antes del inicio se cierra la lista
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
    (p_academy_id, 'waitlist_offer_minutes', 120),
    (p_academy_id, 'waitlist_cutoff_minutes', 30)
  on conflict (academy_id, key) do nothing;
$$;

select public.seed_default_settings(id) from public.academies;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'due_soon', 'grace', 'suspended', 'pack_expiring', 'class_cancelled', 'class_restored', 'announcement', 'waitlist_offer'));

-- ---------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------

create table public.waitlist_entries (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete restrict,
  session_id        uuid not null,
  student_id        uuid not null,
  status            text not null default 'waiting'
                    check (status in ('waiting', 'offered', 'accepted', 'declined', 'expired', 'cancelled', 'closed')),
  offered_at        timestamptz,
  offer_expires_at  timestamptz,
  booking_id        uuid,
  created_by        uuid default public.current_actor_id(),
  created_at        timestamptz not null default clock_timestamp(),  -- orden de llegada exacto
  updated_at        timestamptz not null default now(),
  check (status <> 'offered' or offer_expires_at is not null),
  foreign key (academy_id, session_id) references public.class_sessions (academy_id, id) on delete cascade,
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete cascade
);

-- Una sola anotación activa por alumno y clase.
create unique index waitlist_active_key on public.waitlist_entries (session_id, student_id) where status in ('waiting', 'offered');
create index waitlist_session_idx on public.waitlist_entries (session_id, created_at) where status in ('waiting', 'offered');

create trigger waitlist_touch before update on public.waitlist_entries for each row execute function public.touch_updated_at();
create trigger waitlist_audit after insert or update or delete on public.waitlist_entries for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------
-- Cupo: los lugares ofrecidos (todavía sin vencer) quedan guardados.
-- ---------------------------------------------------------------------

create or replace function public.session_availability(p_session_ids uuid[])
returns table (session_id uuid, capacity integer, fixed integer, booked integer, seats_left integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.id,
         s.capacity,
         f.fixed,
         b.booked,
         greatest(0, s.capacity - f.fixed - b.booked - h.held)
  from public.class_sessions s
  join public.academies a on a.id = s.academy_id
  cross join lateral (
    select count(*)::integer as fixed from public.enrollments e
    where s.schedule_id is not null and e.schedule_id = s.schedule_id
      and e.starts_on <= (s.starts_at at time zone a.timezone)::date
      and (e.ends_on is null or e.ends_on > (s.starts_at at time zone a.timezone)::date)
  ) f
  cross join lateral (
    select count(*)::integer as booked from public.bookings bk where bk.session_id = s.id and bk.status = 'confirmed'
  ) b
  cross join lateral (
    select count(*)::integer as held from public.waitlist_entries w
    where w.session_id = s.id and w.status = 'offered' and w.offer_expires_at > now()
  ) h
  where s.id = any (p_session_ids) and s.academy_id = public.current_academy_id();
$$;

-- ¿Tiene un pack o crédito que sirva para esa clase?
create or replace function public.has_usable_balance(p_student_id uuid, p_starts_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_balances b
    where b.student_id = p_student_id and b.valid_until > now()
      and (b.kind = 'credit' or p_starts_at < b.valid_until)
      and (b.class_window_until is null or p_starts_at <= b.class_window_until)
      and public.balance_remaining(b.id) > 0
  );
$$;

-- ---------------------------------------------------------------------
-- Mover la lista: vencer ofertas, cerrar listas, ofrecer lugares libres. (Uso interno.)
-- ---------------------------------------------------------------------

create or replace function public.refresh_waitlist(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s       public.class_sessions;
  v_offer   integer;
  v_cutoff  integer;
  v_closes  timestamptz;
  v_tz      text;
  v_left    integer;
  v_e       public.waitlist_entries;
  v_until   timestamptz;
begin
  select * into v_s from public.class_sessions where id = p_session_id for update;
  if not found then return; end if;
  v_offer  := coalesce(public.setting(v_s.academy_id, 'waitlist_offer_minutes'), 120);
  v_cutoff := coalesce(public.setting(v_s.academy_id, 'waitlist_cutoff_minutes'), 30);
  v_closes := v_s.starts_at - make_interval(mins => v_cutoff);
  v_tz     := (select timezone from public.academies where id = v_s.academy_id);

  update public.waitlist_entries set status = 'expired'
   where session_id = p_session_id and status = 'offered' and offer_expires_at <= now();

  if v_s.status <> 'scheduled' or now() >= v_closes then
    update public.waitlist_entries set status = 'closed'
     where session_id = p_session_id and status = 'waiting';
    return;
  end if;

  select greatest(0, v_s.capacity - f.fixed - b.booked - h.held) into v_left
  from (select count(*)::integer as fixed from public.enrollments e
        where v_s.schedule_id is not null and e.schedule_id = v_s.schedule_id
          and e.starts_on <= (v_s.starts_at at time zone v_tz)::date
          and (e.ends_on is null or e.ends_on > (v_s.starts_at at time zone v_tz)::date)) f,
       (select count(*)::integer as booked from public.bookings where session_id = p_session_id and status = 'confirmed') b,
       (select count(*)::integer as held from public.waitlist_entries
        where session_id = p_session_id and status = 'offered' and offer_expires_at > now()) h;

  while v_left > 0 loop
    select * into v_e from public.waitlist_entries
     where session_id = p_session_id and status = 'waiting'
     order by created_at limit 1 for update;
    exit when not found;
    -- Si ya no tiene con qué pagarla, no se le ofrece.
    if not public.has_usable_balance(v_e.student_id, v_s.starts_at) then
      update public.waitlist_entries set status = 'closed' where id = v_e.id;
      continue;
    end if;
    v_until := least(now() + make_interval(mins => v_offer), v_closes);
    update public.waitlist_entries set status = 'offered', offered_at = now(), offer_expires_at = v_until where id = v_e.id;
    perform public.notify_student(v_s.academy_id, v_e.student_id, 'waitlist_offer',
      'Se liberó un lugar en tu clase del ' || public.short_day((v_s.starts_at at time zone v_tz)::date)
        || ' a las ' || to_char(v_s.starts_at at time zone v_tz, 'HH24:MI'),
      'Se liberó un lugar para ' || (select first_name from public.students where id = v_e.student_id)
        || ' en la clase del ' || public.short_day((v_s.starts_at at time zone v_tz)::date)
        || ' a las ' || to_char(v_s.starts_at at time zone v_tz, 'HH24:MI'),
      public.session_label(p_session_id) || '. Confirmalo desde Clases antes de las '
        || to_char(v_until at time zone v_tz, 'HH24:MI') || '; si no, pasa al siguiente de la lista.',
      public.session_label(p_session_id) || '. Hay que confirmarlo desde Clases antes de las '
        || to_char(v_until at time zone v_tz, 'HH24:MI') || '; si no, pasa al siguiente de la lista.',
      '/clases', 'espera:' || v_e.id);
    v_left := v_left - 1;
  end loop;
end;
$$;

-- Todas las listas de la academia con algo pendiente (la app la llama al abrir pantallas).
create or replace function public.refresh_waitlists()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in
    select distinct w.session_id from public.waitlist_entries w
    where w.academy_id = public.current_academy_id() and w.status in ('waiting', 'offered')
  loop
    perform public.refresh_waitlist(r.session_id);
  end loop;
end;
$$;

-- Al cancelarse una reserva, el lugar se ofrece enseguida.
create or replace function public.bookings_offer_freed_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status = 'confirmed' then
    perform public.refresh_waitlist(new.session_id);
  end if;
  return null;
end;
$$;

create trigger bookings_offer_freed_seat after update of status on public.bookings
  for each row execute function public.bookings_offer_freed_seat();

-- ---------------------------------------------------------------------
-- Acciones
-- ---------------------------------------------------------------------

-- Anotarse (el alumno, su tutor o recepción). Devuelve el puesto en la lista.
create or replace function public.join_waitlist(p_session_id uuid, p_student_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_student uuid;
  v_s public.class_sessions;
  v_left integer;
  v_cutoff integer;
begin
  if v_academy is null then
    raise exception 'Sesión inválida.' using errcode = '42501';
  end if;
  v_student := public.resolve_booking_student(v_academy, p_student_id);
  perform public.refresh_waitlist(p_session_id);
  select * into v_s from public.class_sessions where id = p_session_id and academy_id = v_academy for update;
  if not found then
    raise exception 'No encontramos esa clase.' using errcode = 'P0002';
  end if;
  if v_s.status <> 'scheduled' then
    raise exception 'Esa clase está suspendida.' using errcode = 'P0001';
  end if;
  v_cutoff := coalesce(public.setting(v_academy, 'waitlist_cutoff_minutes'), 30);
  if now() >= v_s.starts_at - make_interval(mins => v_cutoff) then
    raise exception 'La lista de espera de esa clase ya cerró.' using errcode = 'P0001';
  end if;
  if not (select allows_single_booking from public.class_groups where id = v_s.group_id) then
    raise exception 'Esa clase es sólo para alumnos con cuota de profe.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bookings where session_id = p_session_id and student_id = v_student and status = 'confirmed') then
    raise exception 'Ya tenés reservada esa clase.' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.enrollments e join public.academies ac on ac.id = v_academy
    where e.student_id = v_student and e.schedule_id = v_s.schedule_id
      and e.starts_on <= (v_s.starts_at at time zone ac.timezone)::date
      and (e.ends_on is null or e.ends_on > (v_s.starts_at at time zone ac.timezone)::date)
  ) then
    raise exception 'Esa clase ya es tu clase fija.' using errcode = '23505';
  end if;
  select a.seats_left into v_left from public.session_availability(array[p_session_id]) a;
  if coalesce(v_left, 0) > 0 then
    raise exception 'Hay lugar: reservala directamente.' using errcode = 'P0001';
  end if;
  if not public.has_usable_balance(v_student, v_s.starts_at) then
    raise exception 'No tenés clases disponibles: comprá un pack o una clase en recepción.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.waitlist_entries where session_id = p_session_id and student_id = v_student
             and status in ('waiting', 'offered')) then
    raise exception 'Ya estás en la lista de espera de esa clase.' using errcode = '23505';
  end if;

  insert into public.waitlist_entries (academy_id, session_id, student_id) values (v_academy, p_session_id, v_student);
  return (select count(*) from public.waitlist_entries where session_id = p_session_id and status in ('waiting', 'offered'));
end;
$$;

-- Salir de la lista (o rechazar el lugar ofrecido): pasa al siguiente.
create or replace function public.leave_waitlist(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_e public.waitlist_entries;
begin
  select * into v_e from public.waitlist_entries
   where id = p_entry_id and academy_id = public.current_academy_id() and status in ('waiting', 'offered') for update;
  if not found then
    raise exception 'Ya no estás en esa lista de espera.' using errcode = 'P0002';
  end if;
  if not public.can_book_for(v_e.student_id) and not public.has_permission('people.manage') then
    raise exception 'No tenés permiso para hacer esto.' using errcode = '42501';
  end if;
  update public.waitlist_entries set status = case when v_e.status = 'offered' then 'declined' else 'cancelled' end
   where id = p_entry_id;
  perform public.refresh_waitlist(v_e.session_id);
end;
$$;

-- Confirmar el lugar ofrecido: se reserva con su pack o crédito.
create or replace function public.accept_waitlist_offer(p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.waitlist_entries;
  v_booking uuid;
begin
  select * into v_e from public.waitlist_entries
   where id = p_entry_id and academy_id = public.current_academy_id() for update;
  if not found or v_e.status <> 'offered' then
    raise exception 'Ese lugar ya no está disponible.' using errcode = 'P0002';
  end if;
  if v_e.offer_expires_at <= now() then
    update public.waitlist_entries set status = 'expired' where id = p_entry_id;
    perform public.refresh_waitlist(v_e.session_id);
    raise exception 'Se venció el plazo para confirmar ese lugar.' using errcode = 'P0001';
  end if;
  -- Libera el lugar guardado y lo reserva en el mismo paso (book_session controla permiso y saldo).
  update public.waitlist_entries set status = 'accepted' where id = p_entry_id;
  v_booking := public.book_session(v_e.session_id, v_e.student_id);
  update public.waitlist_entries set booking_id = v_booking where id = p_entry_id;
  return v_booking;
end;
$$;

-- Lista de espera de varias clases (para pantallas): cuántos esperan.
create or replace function public.waitlist_counts(p_session_ids uuid[])
returns table (session_id uuid, waiting integer)
language sql
stable
security definer
set search_path = public
as $$
  select w.session_id, count(*)::integer
  from public.waitlist_entries w
  where w.session_id = any (p_session_ids) and w.academy_id = public.current_academy_id()
    and w.status in ('waiting', 'offered')
  group by w.session_id;
$$;

-- Las anotaciones vigentes de un alumno, con su puesto en cada lista.
create or replace function public.waitlist_for_student(p_student_id uuid)
returns table (entry_id uuid, session_id uuid, status text, offer_expires_at timestamptz, position integer)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.session_id, w.status, w.offer_expires_at,
         (select count(*)::integer from public.waitlist_entries w2
           where w2.session_id = w.session_id and w2.status in ('waiting', 'offered') and w2.created_at <= w.created_at)
  from public.waitlist_entries w
  where w.student_id = p_student_id and w.status in ('waiting', 'offered')
    and (public.is_my_student(p_student_id)
         or (w.academy_id = public.current_academy_id() and public.has_permission('people.view')));
$$;

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------

alter table public.waitlist_entries enable row level security;
revoke all on public.waitlist_entries from anon, authenticated;
grant select on public.waitlist_entries to authenticated;
create policy "Mis listas de espera, o todas si veo personas" on public.waitlist_entries
  for select to authenticated
  using (public.is_my_student(student_id)
         or (academy_id = public.current_academy_id() and public.has_permission('people.view')));

revoke all on function public.has_usable_balance(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_waitlist(uuid) from public, anon, authenticated;
revoke all on function public.bookings_offer_freed_seat() from public, anon, authenticated;
revoke all on function public.refresh_waitlists() from public, anon;
revoke all on function public.join_waitlist(uuid, uuid) from public, anon;
revoke all on function public.leave_waitlist(uuid) from public, anon;
revoke all on function public.accept_waitlist_offer(uuid) from public, anon;
revoke all on function public.waitlist_counts(uuid[]) from public, anon;
revoke all on function public.waitlist_for_student(uuid) from public, anon;
grant execute on function public.waitlist_for_student(uuid) to authenticated;
grant execute on function public.refresh_waitlists() to authenticated;
grant execute on function public.join_waitlist(uuid, uuid) to authenticated;
grant execute on function public.leave_waitlist(uuid) to authenticated;
grant execute on function public.accept_waitlist_offer(uuid) to authenticated;
grant execute on function public.waitlist_counts(uuid[]) to authenticated;
