-- Reporte de profes. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'agus@example.com', '{"first_name":"Agustina","academy":"extreme-dance"}'),
  ('e1000000-0000-0000-0000-00000000000e', 'luli@example.com', '{"first_name":"Luli","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
select grant_role('e1000000-0000-0000-0000-00000000000e', 'teacher');
reset role;

insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, teacher_id, capacity)
select a.id, (select id from dance_styles where name = 'Coreografía'), (select id from age_categories where name = 'Infantil'),
       (select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'agus@example.com'), 10 from academies a;
-- Tres clases de octubre 2026: una normal, una con reemplazo de Luli, una suspendida.
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, capacity, substitute_teacher_id, status, cancel_reason)
select g.academy_id, g.id, ts, ts + interval '1 hour', (select id from rooms limit 1), 10, sub, st, why
from class_groups g,
     (values (timestamptz '2026-10-06 21:00+00', null::uuid, 'scheduled', null),
             (timestamptz '2026-10-13 21:00+00', (select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'luli@example.com'), 'scheduled', null),
             (timestamptz '2026-10-20 21:00+00', null::uuid, 'cancelled', 'Feriado')) v(ts, sub, st, why);
-- Una de noviembre (no entra).
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, capacity)
select academy_id, id, timestamptz '2026-11-03 21:00+00', timestamptz '2026-11-03 22:00+00', (select id from rooms limit 1), 10 from class_groups;
insert into students (academy_id, first_name) select id, 'Mateo' from academies;
insert into attendances (academy_id, student_id, session_id, source)
select s.academy_id, (select id from students where first_name = 'Mateo'), s.id, 'manual' from class_sessions s where s.starts_at = '2026-10-06 21:00+00';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  assert (select count(*) from teacher_report(date '2026-10-15')) = 3, 'tres clases de octubre';
  assert (select taught_by_name from teacher_report(date '2026-10-01') where starts_at = '2026-10-13 21:00+00') = 'Luli', 'reemplazo';
  assert (select owner_name from teacher_report(date '2026-10-01') where starts_at = '2026-10-13 21:00+00') = 'Agustina', 'titular';
  assert (select present from teacher_report(date '2026-10-01') where starts_at = '2026-10-06 21:00+00') = 1, 'presentes';
  assert (select status from teacher_report(date '2026-10-01') where starts_at = '2026-10-20 21:00+00') = 'cancelled', 'suspendida';
  assert (select group_name from teacher_report(date '2026-10-01') limit 1) = 'Coreografía · Infantil', 'grupo';
  raise notice 'OK  reporte de octubre';
end $$;

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform teacher_report(date '2026-10-01');
  raise exception 'recepción lo ve';
exception when insufficient_privilege then
  raise notice 'OK  sólo administración';
end $$;

rollback;
