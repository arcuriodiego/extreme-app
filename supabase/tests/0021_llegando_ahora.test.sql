-- Pruebas de "Llegando ahora". Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'martina@example.com', '{"first_name":"Martina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
-- Precio único (sin recargo por otros medios): estas pruebas son anteriores al precio en efectivo (0030).
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
reset role;

-- Una clase infantil en 10 minutos (con horario que recién empieza en 60 días) y otra lejos.
insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, capacity)
select id, (select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Infantil'), 10 from academies;
insert into class_schedules (academy_id, group_id, weekday, start_time, end_time, room_id, valid_from)
select academy_id, id, 1, '10:00', '11:00', (select id from rooms limit 1), current_date + 60 from class_groups;
insert into class_sessions (academy_id, group_id, schedule_id, starts_at, ends_at, room_id, capacity)
select g.academy_id, g.id, (select id from class_schedules), now() + interval '10 minutes', now() + interval '70 minutes', (select id from rooms limit 1), 10
from class_groups g;
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, capacity)
select academy_id, id, now() + interval '3 hours', now() + interval '4 hours', (select id from rooms limit 1), 10 from class_groups;

-- Tres chicos sin cuenta, con plaza fija: Mateo al día, Juana en gracia, Tomi vencido.
insert into students (academy_id, first_name, last_name) select id, n, 'Prueba' from academies, (values ('Mateo'), ('Juana'), ('Tomi')) v(n);
insert into memberships (academy_id, student_id, plan_id, teacher_id, age_category_id, anchor_day)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'), (select id from teachers limit 1), g.age_category_id, 1
from students s, class_groups g where s.last_name = 'Prueba';
insert into enrollments (academy_id, membership_id, student_id, schedule_id, starts_on)
select m.academy_id, m.id, m.student_id, (select id from class_schedules), current_date - 30 from memberships m;
insert into charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
select m.academy_id, m.student_id, 'membership', m.id, current_date - d, current_date - d + 29, current_date - d, 'Prueba', 5550000
from memberships m join students s on s.id = m.student_id join (values ('Juana', 2), ('Tomi', 20)) v(n, d) on v.n = s.first_name;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare a jsonb; st jsonb;
begin
  perform check_in_student((select id from students where first_name = 'Mateo'));
  a := arrivals_now();
  assert jsonb_array_length(a) = 1, 'sólo la clase que está por empezar';
  st := a -> 0 -> 'students';
  assert jsonb_array_length(st) = 3, 'los tres fijos';
  assert (select x ->> 'state' from jsonb_array_elements(st) x where x ->> 'name' = 'Mateo Prueba') = 'current', 'Mateo al día';
  assert (select (x ->> 'present')::boolean from jsonb_array_elements(st) x where x ->> 'name' = 'Mateo Prueba'), 'Mateo ya ingresó';
  assert (select x ->> 'state' from jsonb_array_elements(st) x where x ->> 'name' = 'Juana Prueba') = 'grace', 'Juana en gracia';
  assert (select x ->> 'state' from jsonb_array_elements(st) x where x ->> 'name' = 'Tomi Prueba') = 'suspended', 'Tomi vencido';
  raise notice 'OK  llegando ahora con estados';
end $$;

set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
begin
  perform arrivals_now();
  raise exception 'el profe no ve estados de cuota';
exception when insufficient_privilege then
  raise notice 'OK  el profe no ve la lista con estados';
end $$;

rollback;
