-- Decisión de Diego (24 oct): la lista de espera es sólo para workshops, no para las clases
-- regulares (cuota de profe, packs, clases sueltas). Se quita la lista de las clases.
-- (La de workshops se arma aparte.)

drop trigger if exists bookings_offer_freed_seat on public.bookings;
drop function if exists public.bookings_offer_freed_seat();
drop function if exists public.join_waitlist(uuid, uuid);
drop function if exists public.leave_waitlist(uuid);
drop function if exists public.accept_waitlist_offer(uuid);
drop function if exists public.waitlist_counts(uuid[]);
drop function if exists public.waitlist_for_student(uuid);
drop function if exists public.refresh_waitlists();
drop function if exists public.refresh_waitlist(uuid);
drop function if exists public.has_usable_balance(uuid, timestamptz);

-- El cupo vuelve a ser: cupo − fijos − reservas.
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
         greatest(0, s.capacity - f.fixed - b.booked)
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
  where s.id = any (p_session_ids) and s.academy_id = public.current_academy_id();
$$;

drop table if exists public.waitlist_entries;

delete from public.app_settings where key in ('waitlist_offer_minutes', 'waitlist_cutoff_minutes');

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
    (p_academy_id, 'checkin_after_minutes', 15)
  on conflict (academy_id, key) do nothing;
$$;
