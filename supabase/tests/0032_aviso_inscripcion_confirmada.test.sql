-- Aviso a la familia al confirmarse la inscripción. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'laura@example.com', '{"first_name":"Laura","academy":"extreme-dance","account_type":"guardian"}');
select bootstrap_admin('diego@example.com');
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';
insert into teachers (academy_id, profile_id, display_name) select academy_id, id, 'Diego' from profiles where email = 'diego@example.com';
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
reset role;

insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, capacity)
select a.id, (select id from dance_styles where name = 'Coreografía'), (select id from age_categories where name = 'Infantil'), 10 from academies a;
insert into class_schedules (academy_id, group_id, weekday, start_time, end_time, room_id, valid_from)
select academy_id, id, 2, '18:00', '19:00', (select id from rooms limit 1), current_date from class_groups;
create temp table sch as select id from class_schedules;
grant select on sch to authenticated;

-- Laura anota a Mateo; Valentina se anota ella.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
select submit_signup('child', 'Mateo', 'F', '55123456', date '2018-03-02', '11 4444-0000', 'madre', array(select id from sch), null);
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select submit_signup('self', '', '', '40123456', date '2000-01-01', '11 5555-1234', null, array(select id from sch), null);

-- 1. Recepción le da la cuota a Mateo: a Laura le llega el aviso.
reset role;
insert into memberships (academy_id, student_id, plan_id, teacher_id, age_category_id, anchor_day)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'), (select id from teachers limit 1),
       (select id from age_categories where name = 'Infantil'), 1
from students s where s.dni = '55123456';
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert (select count(*) from notifications where kind = 'signup_confirmed') = 1, 'Laura recibe el aviso';
  assert (select title from notifications where kind = 'signup_confirmed') = '¡Listo! La inscripción de Mateo está confirmada', (select title from notifications where kind = 'signup_confirmed');
  assert (select link from notifications where kind = 'signup_confirmed') = '/inicio', 'enlace';
  raise notice 'OK  aviso a la madre';
end $$;

-- 2. Recepción marca resuelta la de Valentina (compró un pack): le llega a ella.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select resolve_signup((select r.id from signup_requests r join students s on s.id = r.student_id where s.dni = '40123456'), 'confirmed');
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select title from notifications where kind = 'signup_confirmed') = '¡Listo! Tu inscripción está confirmada', 'a Valentina';
  raise notice 'OK  aviso a la alumna';
end $$;

-- 3. Descartar no avisa.
reset role;
delete from notifications;
update signup_requests set status = 'pending';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select resolve_signup((select r.id from signup_requests r join students s on s.id = r.student_id where s.dni = '40123456'), 'dismissed');
reset role;
do $$
begin
  assert not exists (select 1 from notifications where kind = 'signup_confirmed'), 'descartada no avisa';
  raise notice 'OK  descartar no avisa';
end $$;

rollback;
