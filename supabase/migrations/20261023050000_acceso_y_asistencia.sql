-- Entrega 12 · Acceso con QR y asistencia.
--
-- - Cada alumno tiene una clave secreta. Su celular arma con ella un código QR que
--   cambia cada 30 segundos (EDA1.<alumno>.<ventana>.<firma>), así una captura de
--   pantalla deja de servir enseguida.
-- - Recepción (o el profe) lo escanea: la base verifica la firma, decide si puede
--   entrar a la clase que está por empezar o empezó hace poco, y registra el ingreso
--   y la asistencia en un solo paso.
-- - Puede entrar: con reserva confirmada; con plaza fija y cuota al día o en gracia;
--   con inscripción a un workshop de ese momento. No puede: cuota suspendida, cuota
--   sin primer pago o sin clase en ese horario.
-- - El profe nunca ve deudas: para él sólo hay "habilitado" o "no habilitado".

-- ---------------------------------------------------------------------
-- Reglas nuevas: ventana para registrar el ingreso
-- ---------------------------------------------------------------------

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in (
  'grace_days', 'suspension_alert_days', 'due_reminder_days', 'cancel_hours', 'credit_days',
  'credit_class_window_days', 'booking_hold_minutes', 'session_generation_weeks',
  'checkin_before_minutes',   -- cuánto antes del inicio se puede registrar el ingreso
  'checkin_after_minutes'     -- hasta cuánto después del inicio
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
    (p_academy_id, 'checkin_before_minutes', 60),
    (p_academy_id, 'checkin_after_minutes', 30)
  on conflict (academy_id, key) do nothing;
$$;

select public.seed_default_settings(id) from public.academies;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

-- Clave del QR de cada alumno. Nadie la lee directo: el alumno pide la suya por función.
create table public.student_access_keys (
  student_id  uuid primary key,
  academy_id  uuid not null references public.academies(id) on delete restrict,
  secret      bytea not null check (length(secret) = 32),
  created_at  timestamptz not null default now(),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete cascade
);

-- Presentes: en una clase o en una jornada de workshop.
create table public.attendances (
  id                   uuid primary key default gen_random_uuid(),
  academy_id           uuid not null references public.academies(id) on delete restrict,
  student_id           uuid not null,
  session_id           uuid,
  workshop_session_id  uuid references public.workshop_sessions(id) on delete cascade,
  source               text not null check (source in ('qr', 'manual')),
  marked_by            uuid default public.current_actor_id(),
  created_at           timestamptz not null default now(),
  check (num_nonnulls(session_id, workshop_session_id) = 1),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict,
  foreign key (academy_id, session_id) references public.class_sessions (academy_id, id) on delete restrict
);

create unique index attendances_session_key on public.attendances (session_id, student_id) where session_id is not null;
create unique index attendances_workshop_key on public.attendances (workshop_session_id, student_id) where workshop_session_id is not null;
create index attendances_student_idx on public.attendances (student_id, created_at desc);

-- Registro de cada intento de ingreso (con QR o a mano), entre o no.
create table public.access_logs (
  id                   uuid primary key default gen_random_uuid(),
  academy_id           uuid not null references public.academies(id) on delete restrict,
  student_id           uuid,
  result               text not null check (result in ('allowed', 'grace', 'denied', 'invalid')),
  reason               text not null check (length(reason) <= 40),
  session_id           uuid,
  workshop_session_id  uuid,
  label                text check (length(label) <= 200),
  method               text not null check (method in ('qr', 'manual')),
  scanned_by           uuid default public.current_actor_id(),
  created_at           timestamptz not null default now(),
  foreign key (academy_id, student_id) references public.students (academy_id, id) on delete restrict
);

create index access_logs_academy_idx on public.access_logs (academy_id, created_at desc);

-- ---------------------------------------------------------------------
-- Estado de una cuota de profe en una fecha (mismas reglas que el semáforo de la app)
-- ---------------------------------------------------------------------

create or replace function public.membership_state(p_membership_id uuid, p_today date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m public.memberships;
  v_oldest date;
  v_grace integer;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  if not found then return 'suspended'; end if;
  if v_m.anchor_day is null then return 'unpaid_first'; end if;
  select min(due_date) into v_oldest from public.charges
   where membership_id = p_membership_id and status in ('open', 'partially_paid') and due_date < p_today;
  if v_oldest is null then return 'current'; end if;
  v_grace := coalesce(public.setting(v_m.academy_id, 'grace_days'), 5);
  return case when p_today <= v_oldest + v_grace then 'grace' else 'suspended' end;
end;
$$;

-- Nombre de la clase: "Hip Hop · Adultos · Principiante".
create or replace function public.session_label(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select concat_ws(' · ', ds.name, ac.name, l.name)
  from public.class_sessions s
  join public.class_groups g on g.id = s.group_id
  join public.dance_styles ds on ds.id = g.style_id
  join public.age_categories ac on ac.id = g.age_category_id
  left join public.levels l on l.id = g.level_id
  where s.id = p_session_id;
$$;

-- ---------------------------------------------------------------------
-- ¿Puede entrar ahora? (uso interno)
-- Devuelve: result (allowed / grace / denied), reason, session_id o workshop_session_id, label, starts_at.
-- ---------------------------------------------------------------------

create or replace function public.evaluate_access(p_academy uuid, p_student_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz      text := (select timezone from public.academies where id = p_academy);
  v_before  integer := coalesce(public.setting(p_academy, 'checkin_before_minutes'), 60);
  v_after   integer := coalesce(public.setting(p_academy, 'checkin_after_minutes'), 30);
  v_denied  jsonb;
  v_state   text;
  r record;
begin
  for r in
    select s.id, s.starts_at,
           exists (select 1 from public.bookings b
                   where b.session_id = s.id and b.student_id = p_student_id and b.status = 'confirmed') as booked,
           (select e.membership_id from public.enrollments e
             where s.schedule_id is not null and e.schedule_id = s.schedule_id and e.student_id = p_student_id
               and e.starts_on <= (s.starts_at at time zone v_tz)::date
               and (e.ends_on is null or e.ends_on > (s.starts_at at time zone v_tz)::date)
             limit 1) as membership_id
    from public.class_sessions s
    where s.academy_id = p_academy and s.status = 'scheduled'
      and s.starts_at between p_now - make_interval(mins => v_after) and p_now + make_interval(mins => v_before)
    order by abs(extract(epoch from s.starts_at - p_now))
  loop
    if r.booked then
      return jsonb_build_object('result', 'allowed', 'reason', 'reserva', 'session_id', r.id,
                                'label', public.session_label(r.id), 'starts_at', r.starts_at);
    end if;
    if r.membership_id is not null then
      v_state := public.membership_state(r.membership_id, (p_now at time zone v_tz)::date);
      if v_state = 'current' then
        return jsonb_build_object('result', 'allowed', 'reason', 'fija', 'session_id', r.id,
                                  'label', public.session_label(r.id), 'starts_at', r.starts_at);
      elsif v_state = 'grace' then
        return jsonb_build_object('result', 'grace', 'reason', 'gracia', 'session_id', r.id,
                                  'label', public.session_label(r.id), 'starts_at', r.starts_at);
      elsif v_denied is null then
        v_denied := jsonb_build_object('result', 'denied',
                                       'reason', case when v_state = 'unpaid_first' then 'sin-primer-pago' else 'cuota-vencida' end,
                                       'session_id', r.id, 'label', public.session_label(r.id), 'starts_at', r.starts_at);
      end if;
    end if;
  end loop;

  for r in
    select ws.id, ws.starts_at, w.title
    from public.workshop_sessions ws
    join public.workshops w on w.id = ws.workshop_id and w.status = 'published'
    join public.workshop_registrations wr on wr.workshop_id = w.id and wr.student_id = p_student_id and wr.status = 'confirmed'
    where ws.academy_id = p_academy
      and ws.starts_at between p_now - make_interval(mins => v_after) and p_now + make_interval(mins => v_before)
    order by abs(extract(epoch from ws.starts_at - p_now))
    limit 1
  loop
    return jsonb_build_object('result', 'allowed', 'reason', 'workshop', 'workshop_session_id', r.id,
                              'label', 'Workshop · ' || r.title, 'starts_at', r.starts_at);
  end loop;

  return coalesce(v_denied, jsonb_build_object('result', 'denied', 'reason', 'sin-clase'));
end;
$$;

-- Registra el ingreso (y la asistencia si puede entrar). Uso interno.
create or replace function public.register_entry(p_academy uuid, p_student_id uuid, p_method text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval     jsonb := public.evaluate_access(p_academy, p_student_id);
  v_session  uuid := (v_eval ->> 'session_id')::uuid;
  v_wsession uuid := (v_eval ->> 'workshop_session_id')::uuid;
  v_already  boolean := false;
  v_staff    boolean := public.has_permission('people.view');
  v_name     text;
begin
  select trim(first_name || ' ' || last_name) into v_name from public.students where id = p_student_id;

  if v_eval ->> 'result' in ('allowed', 'grace') then
    if v_session is not null then
      v_already := exists (select 1 from public.attendances where session_id = v_session and student_id = p_student_id);
      insert into public.attendances (academy_id, student_id, session_id, source)
      values (p_academy, p_student_id, v_session, p_method) on conflict do nothing;
    else
      v_already := exists (select 1 from public.attendances where workshop_session_id = v_wsession and student_id = p_student_id);
      insert into public.attendances (academy_id, student_id, workshop_session_id, source)
      values (p_academy, p_student_id, v_wsession, p_method) on conflict do nothing;
    end if;
  end if;

  insert into public.access_logs (academy_id, student_id, result, reason, session_id, workshop_session_id, label, method)
  values (p_academy, p_student_id, v_eval ->> 'result', v_eval ->> 'reason', v_session, v_wsession,
          left(v_eval ->> 'label', 200), p_method);

  v_eval := v_eval || jsonb_build_object('student_id', p_student_id, 'student_name', v_name, 'already', v_already);
  -- El profe sólo ve habilitado / no habilitado: sin motivo de deuda ni gracia.
  if not v_staff then
    v_eval := v_eval || jsonb_build_object(
      'result', case when v_eval ->> 'result' = 'grace' then 'allowed' else v_eval ->> 'result' end,
      'reason', case when v_eval ->> 'result' = 'denied' then 'no-habilitado' else 'habilitado' end);
  end if;
  return v_eval;
end;
$$;

-- ---------------------------------------------------------------------
-- Código QR
-- ---------------------------------------------------------------------

-- Firma de un código: HMAC-SHA256(clave, "<alumno>:<ventana>"), primeros 16 caracteres hex.
create or replace function public.access_code_signature(p_secret bytea, p_student_id uuid, p_window bigint)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select left(encode(hmac(convert_to(p_student_id::text || ':' || p_window::text, 'UTF8'), p_secret, 'sha256'), 'hex'), 16);
$$;

-- El alumno pide su clave para armar el QR en su celular (se crea la primera vez).
create or replace function public.my_access_key()
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
  select id into v_student from public.students where academy_id = v_academy and profile_id = auth.uid();
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

-- Recepción o el profe escanean un QR.
create or replace function public.check_in(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_parts   text[] := string_to_array(trim(coalesce(p_code, '')), '.');
  v_student uuid;
  v_window  bigint;
  v_now_w   bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_secret  bytea;
begin
  if v_academy is null or not public.has_permission('attendance.mark') then
    raise exception 'No tenés permiso para registrar ingresos.' using errcode = '42501';
  end if;
  if array_length(v_parts, 1) is distinct from 4 or v_parts[1] <> 'EDA1'
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[3] !~ '^[0-9]{1,12}$' or v_parts[4] !~ '^[0-9a-f]{16}$' then
    return jsonb_build_object('result', 'invalid', 'reason', 'qr-invalido');
  end if;
  v_student := v_parts[2]::uuid;
  v_window := v_parts[3]::bigint;

  select k.secret into v_secret from public.student_access_keys k
   where k.student_id = v_student and k.academy_id = v_academy;
  if v_secret is null or public.access_code_signature(v_secret, v_student, v_window) <> v_parts[4] then
    return jsonb_build_object('result', 'invalid', 'reason', 'qr-invalido');
  end if;
  -- Vale la ventana actual y las vecinas (±1 minuto), por diferencias de reloj.
  if abs(v_window - v_now_w) > 2 then
    insert into public.access_logs (academy_id, student_id, result, reason, method)
    values (v_academy, v_student, 'invalid', 'qr-vencido', 'qr');
    return jsonb_build_object('result', 'invalid', 'reason', 'qr-vencido', 'student_id', v_student,
      'student_name', (select trim(first_name || ' ' || last_name) from public.students where id = v_student));
  end if;

  return public.register_entry(v_academy, v_student, 'qr');
end;
$$;

-- Recepción registra el ingreso a mano (por ejemplo, si el alumno no tiene el celular).
create or replace function public.check_in_student(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if v_academy is null or not public.has_permission('attendance.mark') or not public.has_permission('people.view') then
    raise exception 'No tenés permiso para registrar ingresos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and academy_id = v_academy) then
    raise exception 'No encontramos al alumno.' using errcode = 'P0002';
  end if;
  return public.register_entry(v_academy, p_student_id, 'manual');
end;
$$;

-- ---------------------------------------------------------------------
-- Lista de una clase y asistencia a mano
-- ---------------------------------------------------------------------

-- ¿Quien llama da esta clase (o la reemplaza)?
create or replace function public.teaches_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_sessions s
    join public.teachers t on t.id = coalesce(s.substitute_teacher_id, s.teacher_id)
    where s.id = p_session_id and t.profile_id = auth.uid()
  );
$$;

-- Alumnos de la clase: fijos de ese día y reservas. "enabled" = puede tomarla.
create or replace function public.session_roster(p_session_id uuid)
returns table (student_id uuid, full_name text, kind text, enabled boolean, present boolean)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select cs.*, (cs.starts_at at time zone a.timezone)::date as day
    from public.class_sessions cs join public.academies a on a.id = cs.academy_id
    where cs.id = p_session_id and cs.academy_id = public.current_academy_id()
      and (public.has_permission('people.view') or public.teaches_session(cs.id))
  ), people as (
    select e.student_id, 'fija'::text as kind,
           public.membership_state(e.membership_id, s.day) in ('current', 'grace') as enabled
    from s join public.enrollments e on s.schedule_id is not null and e.schedule_id = s.schedule_id
     and e.starts_on <= s.day and (e.ends_on is null or e.ends_on > s.day)
    union all
    select b.student_id, 'reserva', true
    from s join public.bookings b on b.session_id = s.id and b.status = 'confirmed'
  )
  select p.student_id, trim(st.first_name || ' ' || st.last_name), p.kind, p.enabled,
         exists (select 1 from public.attendances att where att.session_id = p_session_id and att.student_id = p.student_id)
  from people p join public.students st on st.id = p.student_id
  union all
  -- Presentes que no figuran en la lista (por ejemplo, una reserva cancelada después).
  select att.student_id, trim(st.first_name || ' ' || st.last_name), 'otro', true, true
  from s join public.attendances att on att.session_id = s.id
  join public.students st on st.id = att.student_id
  where not exists (select 1 from people p where p.student_id = att.student_id)
  order by 2;
$$;

-- El profe (o recepción) marca o desmarca presente a mano.
create or replace function public.mark_attendance(p_session_id uuid, p_student_id uuid, p_present boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_s public.class_sessions;
  v_before integer;
  v_row record;
begin
  if v_academy is null or not public.has_permission('attendance.mark') then
    raise exception 'No tenés permiso para tomar asistencia.' using errcode = '42501';
  end if;
  select * into v_s from public.class_sessions where id = p_session_id and academy_id = v_academy;
  if not found or v_s.status <> 'scheduled' then
    raise exception 'Esa clase no está disponible.' using errcode = 'P0002';
  end if;
  if not public.has_permission('people.manage') and not public.teaches_session(p_session_id) then
    raise exception 'Sólo podés tomar asistencia en tus clases.' using errcode = '42501';
  end if;
  v_before := coalesce(public.setting(v_academy, 'checkin_before_minutes'), 60);
  if now() < v_s.starts_at - make_interval(mins => v_before) or now() > v_s.starts_at + interval '7 days' then
    raise exception 'La asistencia se toma desde un rato antes de la clase y hasta 7 días después.' using errcode = '22023';
  end if;

  if not p_present then
    delete from public.attendances where session_id = p_session_id and student_id = p_student_id;
    return;
  end if;
  select * into v_row from public.session_roster(p_session_id) r where r.student_id = p_student_id limit 1;
  if not found then
    raise exception 'Ese alumno no está en la lista de esta clase.' using errcode = 'P0002';
  end if;
  if not v_row.enabled then
    raise exception 'No está habilitado: que pase por recepción.' using errcode = 'P0001';
  end if;
  insert into public.attendances (academy_id, student_id, session_id, source)
  values (v_academy, p_student_id, p_session_id, 'manual') on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- Auditoría y seguridad
-- ---------------------------------------------------------------------

create trigger attendances_audit after insert or update or delete on public.attendances
  for each row execute function public.write_audit_log();

alter table public.student_access_keys enable row level security;
alter table public.attendances         enable row level security;
alter table public.access_logs         enable row level security;

revoke all on public.student_access_keys, public.attendances, public.access_logs from anon, authenticated;
grant select on public.attendances, public.access_logs to authenticated;

create policy "Mis asistencias, o todas si veo personas" on public.attendances
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    or (academy_id = public.current_academy_id() and public.has_permission('people.view'))
  );
create policy "Ingresos: recepción y administración" on public.access_logs
  for select to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('people.view'));

-- Internas
revoke all on function public.membership_state(uuid, date) from public, anon, authenticated;
revoke all on function public.session_label(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_access(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.register_entry(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.access_code_signature(bytea, uuid, bigint) from public, anon, authenticated;
revoke all on function public.teaches_session(uuid) from public, anon, authenticated;
-- Para la app
revoke all on function public.my_access_key() from public, anon;
revoke all on function public.check_in(text) from public, anon;
revoke all on function public.check_in_student(uuid) from public, anon;
revoke all on function public.session_roster(uuid) from public, anon;
revoke all on function public.mark_attendance(uuid, uuid, boolean) from public, anon;
grant execute on function public.my_access_key() to authenticated;
grant execute on function public.check_in(text) to authenticated;
grant execute on function public.check_in_student(uuid) to authenticated;
grant execute on function public.session_roster(uuid) to authenticated;
grant execute on function public.mark_attendance(uuid, uuid, boolean) to authenticated;
