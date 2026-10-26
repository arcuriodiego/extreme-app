-- Pruebas de cuentas de tutor: los padres no toman clases. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'laura@example.com', '{"first_name":"Laura","academy":"extreme-dance","account_type":"guardian"}'),
  ('c1000000-0000-0000-0000-00000000000c', 'pablo@example.com', '{"first_name":"Pablo","academy":"extreme-dance"}'),
  ('c2000000-0000-0000-0000-00000000000c', 'sofi@example.com', '{"first_name":"Sofía","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
insert into teachers (academy_id, profile_id, display_name) select academy_id, id, 'Diego' from profiles where email = 'diego@example.com';

insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, capacity)
select a.id, (select id from dance_styles where name = 'Coreografía'), (select id from age_categories where name = 'Infantil'), 10 from academies a;
insert into class_schedules (academy_id, group_id, weekday, start_time, end_time, room_id, valid_from)
select academy_id, id, 2, '18:00', '19:00', (select id from rooms limit 1), current_date from class_groups;
create temp table sch as select id from class_schedules;
grant select on sch to authenticated;

create function pg_temp.roles_of(p uuid) returns text[] language sql as $$
  select coalesce(array_agg(r.code order by r.code), '{}') from user_roles ur join roles r on r.id = ur.role_id where ur.profile_id = p;
$$;

-- 1. Laura se registró como tutora: sin ficha ni rol de alumno.
do $$
begin
  assert pg_temp.roles_of('c0000000-0000-0000-0000-00000000000c') = array['guardian'], pg_temp.roles_of('c0000000-0000-0000-0000-00000000000c')::text;
  assert not exists (select 1 from students where profile_id = 'c0000000-0000-0000-0000-00000000000c'), 'sin ficha';
  raise notice 'OK  registro como tutora';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  perform submit_signup('self', '', '', '30111222', date '1985-01-01', '11 4444-0000', null, array(select id from sch), null);
  raise exception 'una tutora no se anota para sí';
exception when invalid_parameter_value then
  raise notice 'OK  la tutora no se inscribe a clases';
end $$;
do $$
declare s uuid;
begin
  s := submit_signup('child', 'Mateo', 'F', '55123456', date '2018-03-02', '11 4444-0000', 'madre', array(select id from sch), null);
  assert (select count(*) from my_students()) = 1, 've sólo a su hijo';
  assert not (select is_self from my_students()), 'no es ella';
  raise notice 'OK  la tutora anota a su hijo';
end $$;

-- 2. Pablo se registró como alumno, pero sólo anota a su hija: queda como tutor.
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-00000000000c"}';
do $$
begin
  perform submit_signup('child', 'Lola', 'P', '55123457', date '2017-03-02', '11 4444-0001', 'padre', array(select id from sch), null);
  assert pg_temp.roles_of('c1000000-0000-0000-0000-00000000000c') = array['guardian'], pg_temp.roles_of('c1000000-0000-0000-0000-00000000000c')::text;
  assert not exists (select 1 from students where profile_id = 'c1000000-0000-0000-0000-00000000000c'), 'ficha vacía borrada';
  raise notice 'OK  el padre con ficha vacía queda como tutor';
end $$;

-- 3. Sofía toma clases (tiene cuota) y anota a su hijo: sigue siendo alumna.
reset role;
insert into memberships (academy_id, student_id, plan_id, age_category_id, anchor_day, teacher_id)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'), (select id from age_categories where name = 'Adultos'), 1,
       (select id from teachers limit 1)
from students s where s.profile_id = 'c2000000-0000-0000-0000-00000000000c';
set local role authenticated;
set local request.jwt.claims = '{"sub":"c2000000-0000-0000-0000-00000000000c"}';
do $$
begin
  perform submit_signup('child', 'Tomi', 'S', '55123458', date '2016-03-02', '11 4444-0002', 'madre', array(select id from sch), null);
  assert pg_temp.roles_of('c2000000-0000-0000-0000-00000000000c') = array['guardian', 'student'], pg_temp.roles_of('c2000000-0000-0000-0000-00000000000c')::text;
  assert exists (select 1 from students where profile_id = 'c2000000-0000-0000-0000-00000000000c'), 'conserva su ficha';
  assert (select count(*) from my_students()) = 2, 'ella y su hijo';
  raise notice 'OK  la madre que toma clases sigue siendo alumna';
end $$;

rollback;
