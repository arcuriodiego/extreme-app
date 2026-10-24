-- Entrega 15 · Avisos dentro de la app.
--
-- - notifications: la bandeja de cada persona (alumno, tutor, profe). Cada aviso existe una
--   sola vez por persona (dedupe_key), así una regla diaria no lo repite.
-- - Automáticos (una vez por día, al abrir la app): cuota por vencer, cuota en gracia,
--   acceso suspendido, pack por vencer con clases sin usar.
-- - Al suspender una clase: a los fijos de ese día y a quienes la reservaron.
-- - Envíos manuales (announcements): recepción a todos los alumnos o a un grupo; el profe a sus grupos.
-- - Los avisos de un alumno llegan a su cuenta (si tiene) y a sus tutores (si reciben avisos).
-- - Email y notificaciones al celular se suman después (Resend y dominio).

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete restrict,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  student_id    uuid,                    -- de quién habla el aviso (para tutores)
  kind          text not null check (kind in ('due_soon', 'grace', 'suspended', 'pack_expiring', 'class_cancelled', 'announcement')),
  title         text not null check (length(title) between 1 and 140),
  body          text not null default '' check (length(body) <= 1000),
  link          text check (link is null or link ~ '^/[a-z0-9/_-]*$'),
  dedupe_key    text not null check (length(dedupe_key) <= 200),
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  unique (recipient_id, dedupe_key),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete cascade
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

create table public.announcements (
  id               uuid primary key default gen_random_uuid(),
  academy_id       uuid not null references public.academies(id) on delete restrict,
  author_id        uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  group_id         uuid,                 -- vacío = todos los alumnos activos
  title            text not null check (length(trim(title)) between 1 and 120),
  body             text not null default '' check (length(body) <= 1000),
  recipients_count integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (academy_id, id),
  foreign key (academy_id, group_id) references public.class_groups (academy_id, id) on delete set null (group_id)
);

create index announcements_academy_idx on public.announcements (academy_id, created_at desc);

create table public.notification_runs (
  academy_id  uuid primary key references public.academies(id) on delete cascade,
  ran_on      date not null,
  ran_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Ayudas para armar textos
-- ---------------------------------------------------------------------

create or replace function public.ars(p_cents bigint)
returns text
language sql
immutable
as $$
  select '$' || replace(to_char(p_cents / 100, 'FM999,999,999'), ',', '.');
$$;

create or replace function public.short_day(p_date date)
returns text
language sql
immutable
as $$
  select (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])[extract(isodow from p_date)::int]
         || ' ' || to_char(p_date, 'DD/MM');
$$;

-- Avisa sobre un alumno: a su cuenta (con "vos") y a sus tutores (con su nombre).
-- Devuelve cuántos avisos nuevos creó.
create or replace function public.notify_student(
  p_academy uuid, p_student_id uuid, p_kind text,
  p_title_self text, p_title_other text, p_body_self text, p_body_other text,
  p_link text, p_dedupe text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_count integer := 0;
  v_n integer;
begin
  select profile_id into v_profile from public.students where id = p_student_id;
  if v_profile is not null then
    insert into public.notifications (academy_id, recipient_id, student_id, kind, title, body, link, dedupe_key)
    values (p_academy, v_profile, p_student_id, p_kind, left(p_title_self, 140), left(p_body_self, 1000), p_link, p_dedupe)
    on conflict (recipient_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;
  insert into public.notifications (academy_id, recipient_id, student_id, kind, title, body, link, dedupe_key)
  select p_academy, g.profile_id, p_student_id, p_kind, left(p_title_other, 140), left(p_body_other, 1000), p_link, p_dedupe
  from public.guardian_students gs
  join public.guardians g on g.id = gs.guardian_id
  where gs.student_id = p_student_id and gs.receives_notifications
    and g.profile_id is distinct from v_profile
  on conflict (recipient_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  return v_count + v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Avisos automáticos del día
-- ---------------------------------------------------------------------

create or replace function public.generate_notifications(p_academy uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.academy_today(p_academy);
  v_tz    text := (select timezone from public.academies where id = p_academy);
  v_soon  integer := coalesce(public.setting(p_academy, 'due_reminder_days'), 3);
  v_grace integer := coalesce(public.setting(p_academy, 'grace_days'), 5);
  v_total integer := 0;
  r record;
  v_name text;
  v_last date;
begin
  -- Cuotas por vencer.
  for r in
    select c.id, c.student_id, c.due_date, c.total_cents - c.paid_cents as owed, s.first_name
    from public.charges c
    join public.memberships m on m.id = c.membership_id and m.status = 'active'
    join public.students s on s.id = c.student_id
    where c.academy_id = p_academy and c.concept = 'membership' and c.status in ('open', 'partially_paid')
      and c.due_date between v_today and v_today + v_soon
  loop
    v_total := v_total + public.notify_student(p_academy, r.student_id, 'due_soon',
      'Tu cuota vence el ' || public.short_day(r.due_date),
      'La cuota de ' || r.first_name || ' vence el ' || public.short_day(r.due_date),
      'Son ' || public.ars(r.owed) || '. Podés pagarla en recepción.',
      'Son ' || public.ars(r.owed) || '. Se puede pagar en recepción.',
      '/pagos', 'vence:' || r.id);
  end loop;

  -- Cuotas en gracia o suspendidas (por el cargo impago más antiguo).
  for r in
    select m.id, m.student_id, s.first_name,
           (select c.id from public.charges c where c.membership_id = m.id and c.status in ('open', 'partially_paid')
              and c.due_date < v_today order by c.due_date limit 1) as charge_id,
           (select min(c.due_date) from public.charges c where c.membership_id = m.id and c.status in ('open', 'partially_paid')
              and c.due_date < v_today) as oldest
    from public.memberships m
    join public.students s on s.id = m.student_id
    where m.academy_id = p_academy and m.status = 'active' and m.anchor_day is not null
  loop
    continue when r.oldest is null;
    v_last := r.oldest + v_grace;
    if v_today <= v_last then
      v_total := v_total + public.notify_student(p_academy, r.student_id, 'grace',
        'Tu cuota venció el ' || public.short_day(r.oldest),
        'La cuota de ' || r.first_name || ' venció el ' || public.short_day(r.oldest),
        'Podés seguir viniendo hasta el ' || public.short_day(v_last) || '. Pagala en recepción para no perder el acceso.',
        'Puede seguir viniendo hasta el ' || public.short_day(v_last) || '. Se puede pagar en recepción.',
        '/pagos', 'gracia:' || r.charge_id);
    else
      v_total := v_total + public.notify_student(p_academy, r.student_id, 'suspended',
        'Tu acceso a las clases está suspendido',
        'El acceso de ' || r.first_name || ' a las clases está suspendido',
        'La cuota venció el ' || public.short_day(r.oldest) || '. Cuando la pagues en recepción, volvés a entrar. Tu lugar fijo se mantiene.',
        'La cuota venció el ' || public.short_day(r.oldest) || '. Al pagarla en recepción vuelve a entrar. Su lugar fijo se mantiene.',
        '/pagos', 'suspendida:' || r.charge_id);
    end if;
  end loop;

  -- Packs por vencer con clases sin usar.
  for r in
    select b.id, b.student_id, s.first_name, ((b.valid_until at time zone v_tz)::date - 1) as last_day,
           public.balance_remaining(b.id) as remaining
    from public.class_balances b
    join public.students s on s.id = b.student_id
    where b.academy_id = p_academy and b.kind = 'pack'
      and b.valid_until > now() and (b.valid_until at time zone v_tz)::date - 1 <= v_today + v_soon
  loop
    continue when r.remaining <= 0;
    v_total := v_total + public.notify_student(p_academy, r.student_id, 'pack_expiring',
      'Tu pack vence el ' || public.short_day(r.last_day),
      'El pack de ' || r.first_name || ' vence el ' || public.short_day(r.last_day),
      'Te quedan ' || r.remaining || case when r.remaining = 1 then ' clase' else ' clases' end || '. Reservalas desde Clases antes de que venza.',
      'Le quedan ' || r.remaining || case when r.remaining = 1 then ' clase' else ' clases' end || '. Se pueden reservar desde Clases.',
      '/clases', 'pack:' || r.id);
  end loop;

  insert into public.notification_runs (academy_id, ran_on) values (p_academy, v_today)
  on conflict (academy_id) do update set ran_on = excluded.ran_on, ran_at = now();
  return v_total;
end;
$$;

-- La app la llama al abrir Inicio o Avisos: genera una vez por día.
create or replace function public.ensure_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if v_academy is null then return 0; end if;
  if exists (select 1 from public.notification_runs
             where academy_id = v_academy and ran_on >= public.academy_today(v_academy)) then
    return 0;
  end if;
  perform public.generate_membership_charges(v_academy);
  return public.generate_notifications(v_academy);
end;
$$;

-- ---------------------------------------------------------------------
-- Clase suspendida: aviso a los fijos de ese día y a quienes la reservaron.
-- (Corre antes que la devolución de reservas: el nombre del disparador va primero.)
-- ---------------------------------------------------------------------

create or replace function public.notify_cancelled_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz    text := (select timezone from public.academies where id = new.academy_id);
  v_day   date := (new.starts_at at time zone v_tz)::date;
  v_when  text;
  v_label text := public.session_label(new.id);
  r record;
begin
  if not (new.status = 'cancelled' and old.status <> 'cancelled' and new.starts_at > now()) then
    return null;
  end if;
  v_when := public.short_day(v_day) || ' a las ' || to_char(new.starts_at at time zone v_tz, 'HH24:MI');
  for r in
    select e.student_id, s.first_name, false as booked
    from public.enrollments e join public.students s on s.id = e.student_id
    where new.schedule_id is not null and e.schedule_id = new.schedule_id
      and e.starts_on <= v_day and (e.ends_on is null or e.ends_on > v_day)
    union
    select b.student_id, s.first_name, true
    from public.bookings b join public.students s on s.id = b.student_id
    where b.session_id = new.id and b.status = 'confirmed'
  loop
    perform public.notify_student(new.academy_id, r.student_id, 'class_cancelled',
      'Se suspendió tu clase del ' || v_when,
      'Se suspendió la clase de ' || r.first_name || ' del ' || v_when,
      v_label || '. Motivo: ' || coalesce(new.cancel_reason, 'sin motivo') ||
        case when r.booked then '. Te devolvimos la clase reservada.' else '.' end,
      v_label || '. Motivo: ' || coalesce(new.cancel_reason, 'sin motivo') ||
        case when r.booked then '. Le devolvimos la clase reservada.' else '.' end,
      '/clases', 'clase-suspendida:' || new.id);
  end loop;
  return null;
end;
$$;

create trigger class_sessions_notify_cancelled after update of status on public.class_sessions
  for each row execute function public.notify_cancelled_session();

-- ---------------------------------------------------------------------
-- Envíos manuales
-- ---------------------------------------------------------------------

-- Recepción: a todos los alumnos activos (p_group_id vacío) o a un grupo.
-- Profe: sólo a sus grupos. Llega a los alumnos con plaza fija vigente en el grupo
-- y a quienes reservaron una clase futura del grupo (y a sus tutores).
create or replace function public.send_announcement(p_group_id uuid, p_title text, p_body text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_today   date;
  v_ann     uuid;
  v_title   text := trim(coalesce(p_title, ''));
  v_body    text := trim(coalesce(p_body, ''));
  v_count   integer := 0;
  r record;
begin
  if v_academy is null then
    raise exception 'No tenés permiso para enviar avisos.' using errcode = '42501';
  end if;
  if p_group_id is null then
    if not public.has_permission('people.manage') then
      raise exception 'No tenés permiso para enviar avisos a todos.' using errcode = '42501';
    end if;
  else
    if not exists (select 1 from public.class_groups where id = p_group_id and academy_id = v_academy) then
      raise exception 'Ese grupo no existe.' using errcode = 'P0002';
    end if;
    if not public.has_permission('people.manage')
       and not exists (select 1 from public.class_groups g join public.teachers t on t.id = g.teacher_id
                       where g.id = p_group_id and t.profile_id = auth.uid()) then
      raise exception 'Sólo podés enviar avisos a tus grupos.' using errcode = '42501';
    end if;
  end if;
  if length(v_title) = 0 or length(v_title) > 120 then
    raise exception 'Escribí un título de hasta 120 letras.' using errcode = '22023';
  end if;
  if length(v_body) > 1000 then
    raise exception 'El mensaje puede tener hasta 1000 letras.' using errcode = '22023';
  end if;

  v_today := public.academy_today(v_academy);
  insert into public.announcements (academy_id, group_id, title, body)
  values (v_academy, p_group_id, v_title, v_body) returning id into v_ann;

  for r in
    select s.id as student_id
    from public.students s
    where s.academy_id = v_academy and p_group_id is null and s.status in ('active', 'trial')
    union
    select e.student_id
    from public.enrollments e join public.class_schedules cs on cs.id = e.schedule_id
    where p_group_id is not null and cs.group_id = p_group_id and e.status = 'active'
    union
    select b.student_id
    from public.bookings b join public.class_sessions se on se.id = b.session_id
    where p_group_id is not null and se.group_id = p_group_id and b.status = 'confirmed' and se.starts_at > now()
  loop
    v_count := v_count + public.notify_student(v_academy, r.student_id, 'announcement',
      v_title, v_title, v_body, v_body, '/avisos', 'aviso:' || v_ann);
  end loop;

  update public.announcements set recipients_count = v_count where id = v_ann;
  return v_count;
end;
$$;

-- Marcar como leídos todos mis avisos.
create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications set read_at = now() where recipient_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------

alter table public.notifications     enable row level security;
alter table public.announcements     enable row level security;
alter table public.notification_runs enable row level security;
revoke all on public.notifications, public.announcements, public.notification_runs from anon, authenticated;
grant select on public.notifications, public.announcements to authenticated;

create policy "Mis avisos" on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "Avisos enviados: los míos, o todos si veo personas" on public.announcements
  for select to authenticated
  using (author_id = (select auth.uid())
         or (academy_id = public.current_academy_id() and public.has_permission('people.view')));

create trigger announcements_audit after insert or update or delete on public.announcements
  for each row execute function public.write_audit_log();

revoke all on function public.notify_student(uuid, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.generate_notifications(uuid) from public, anon, authenticated;
revoke all on function public.notify_cancelled_session() from public, anon, authenticated;
revoke all on function public.ensure_notifications() from public, anon;
revoke all on function public.send_announcement(uuid, text, text) from public, anon;
revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.ensure_notifications() to authenticated;
grant execute on function public.send_announcement(uuid, text, text) to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
