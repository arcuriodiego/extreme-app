-- Pruebas de avisos. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'agus@example.com', '{"first_name":"Agustina","academy":"extreme-dance"}'),
  ('e1000000-0000-0000-0000-00000000000e', 'otra@example.com', '{"first_name":"Otra","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'laura@example.com', '{"first_name":"Laura","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
select grant_role('e1000000-0000-0000-0000-00000000000e', 'teacher');
reset role;

-- Grupo de Agustina con horario que empieza en 60 días; una clase de ese horario mañana.
insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, teacher_id, capacity)
select a.id, (select id from dance_styles where name = 'Coreografía'), (select id from age_categories where name = 'Infantil'),
       (select id from teachers where profile_id = 'e0000000-0000-0000-0000-00000000000e'), 10 from academies a;
insert into class_schedules (academy_id, group_id, weekday, start_time, end_time, room_id, valid_from)
select academy_id, id, 1, '18:00', '19:00', (select id from rooms limit 1), current_date + 60 from class_groups;
insert into class_sessions (academy_id, group_id, schedule_id, starts_at, ends_at, room_id, capacity)
select g.academy_id, g.id, (select id from class_schedules), now() + interval '1 day', now() + interval '1 day 1 hour', (select id from rooms limit 1), 10
from class_groups g;

-- Mateo (sin cuenta, tutora Laura) y Vale (con cuenta), fijos en el grupo.
insert into students (academy_id, first_name, last_name) select id, 'Mateo', 'F' from academies;
insert into memberships (academy_id, student_id, plan_id, teacher_id, age_category_id, anchor_day)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'), g.teacher_id, g.age_category_id, 1
from students s, class_groups g where s.first_name in ('Mateo', 'Valentina');
insert into enrollments (academy_id, membership_id, student_id, schedule_id, starts_on)
select m.academy_id, m.id, m.student_id, (select id from class_schedules), current_date - 30 from memberships m;
-- Mateo: cuota vence en 2 días. Vale: venció hace 2 días (gracia).
insert into charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
select m.academy_id, m.student_id, 'membership', m.id, current_date + d, current_date + d + 29, current_date + d, 'Prueba', 5550000
from memberships m join students s on s.id = m.student_id join (values ('Mateo', 2), ('Valentina', -2)) v(n, d) on v.n = s.first_name;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select link_guardian((select id from students where first_name = 'Mateo'), 'laura@example.com', 'madre');

-- 1. Avisos del día: una sola vez, a la alumna y a la tutora (con el nombre del chico).
do $$
begin
  perform ensure_notifications();
  perform ensure_notifications();
  raise notice 'OK  generación diaria';
end $$;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert (select count(*) from notifications) = 1, format('Laura recibe un aviso: %s', (select count(*) from notifications));
  assert (select title from notifications) like 'La cuota de Mateo vence el %', (select title from notifications);
  assert (select body from notifications) = 'Son $55.500. Se puede pagar en recepción.', (select body from notifications);
  raise notice 'OK  aviso a la tutora';
end $$;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select count(*) from notifications where kind = 'grace') = 1, 'Vale en gracia';
  assert (select title from notifications where kind = 'grace') like 'Tu cuota venció el %', 'con vos';
  perform mark_notifications_read();
  assert not exists (select 1 from notifications where read_at is null), 'leídos';
  raise notice 'OK  aviso de gracia y leídos';
end $$;

-- 2. Se suspende la clase de mañana: avisa a los fijos (y a la tutora).
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select cancel_session((select id from class_sessions limit 1), 'Corte de luz');
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert (select count(*) from notifications where kind = 'class_cancelled') = 1, 'Laura sabe que se suspendió';
  assert (select body from notifications where kind = 'class_cancelled') like '%Motivo: Corte de luz.', 'con motivo';
  raise notice 'OK  clase suspendida';
end $$;

-- 2b. Vuelve a programarse: avisa de nuevo; y una segunda suspensión también avisa.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select restore_session((select id from class_sessions limit 1));
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert (select count(*) from notifications where kind = 'class_restored') = 1, 'Laura sabe que vuelve la clase';
  assert (select title from notifications where kind = 'class_restored') like 'Vuelve la clase de Mateo del %', 'con el nombre';
  raise notice 'OK  clase reprogramada';
end $$;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select cancel_session((select id from class_sessions limit 1), 'Otra vez sin luz');
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert (select count(*) from notifications where kind = 'class_cancelled') = 2, 'la segunda suspensión también avisa';
  raise notice 'OK  segunda suspensión';
end $$;

-- 3. Envíos: la profe a su grupo; otra profe no; recepción a todos.
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
declare n integer;
begin
  n := send_announcement((select id from class_groups limit 1), 'Traigan ropa cómoda', 'El sábado ensayamos la muestra.');
  assert n = 2, format('a Vale y a Laura: %s', n);
  begin
    perform send_announcement(null, 'A todos', '');
    raise exception 'la profe no envía a todos';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la profe avisa a su grupo';
end $$;
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-00000000000e"}';
do $$
begin
  perform send_announcement((select id from class_groups limit 1), 'Hola', '');
  raise exception 'otra profe no avisa a grupos ajenos';
exception when insufficient_privilege then
  raise notice 'OK  grupos ajenos protegidos';
end $$;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare n integer;
begin
  n := send_announcement(null, 'Feriado el lunes', 'No hay clases.');
  assert n >= 2, format('a todos los alumnos activos con cuenta y tutores: %s', n);
  assert (select recipients_count from announcements where title = 'Feriado el lunes') = n, 'cantidad guardada';
  raise notice 'OK  recepción avisa a todos';
end $$;

-- 4. Cada uno ve sólo sus avisos.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert not exists (select 1 from notifications where recipient_id <> 'b0000000-0000-0000-0000-00000000000b'), 'sólo los suyos';
  assert (select count(*) from notifications where kind = 'announcement') = 2, 'el de la profe y el de recepción';
  assert (select count(*) from announcements) = 0, 'no ve los envíos';
  raise notice 'OK  avisos privados';
end $$;

rollback;
