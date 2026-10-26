-- Pruebas de autoinscripción. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'agus@example.com', '{"first_name":"Agustina","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","last_name":"Ruiz","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'laura@example.com', '{"first_name":"Laura","academy":"extreme-dance"}'),
  ('c1000000-0000-0000-0000-00000000000c', 'otra@example.com', '{"first_name":"Otra","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
reset role;

insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, teacher_id, capacity)
select a.id, (select id from dance_styles where name = 'Coreografía'), (select id from age_categories where name = 'Infantil'),
       (select id from teachers limit 1), 10 from academies a;
insert into class_schedules (academy_id, group_id, weekday, start_time, end_time, room_id, valid_from)
select academy_id, id, d, '18:00', '19:00', (select id from rooms limit 1), current_date
from class_groups, (values (1), (3)) v(d);
-- Un horario que ya terminó.
insert into class_schedules (academy_id, group_id, weekday, start_time, end_time, room_id, valid_from, valid_to)
select academy_id, id, 5, '18:00', '19:00', (select id from rooms limit 1), current_date - 60, current_date - 1 from class_groups;

create temp table sch as select id, weekday from class_schedules;
grant select on sch to authenticated;

-- 1. Valentina se inscribe ella misma.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare s uuid;
begin
  s := submit_signup('self', '', '', '40.123.456', date '2000-05-10', '11 5555-1234', null,
                     array(select id from sch where weekday in (1, 3)), 'Vengo de otra academia');
  assert s is not null, 'ficha';
  raise exception 'el DNI con puntos no pasa';
exception when invalid_parameter_value then
  raise notice 'OK  DNI inválido rechazado';
end $$;
do $$
declare s uuid;
begin
  s := submit_signup('self', '', '', '40123456', date '2000-05-10', '11 5555-1234', null,
                     array(select id from sch where weekday in (1, 3)), 'Vengo de otra academia');
  assert (select dni from students where id = s) = '40123456', 'DNI guardado';
  assert (select first_name from students where id = s) = 'Valentina', 'nombre de la cuenta';
  assert (select birth_date from profiles where id = 'b0000000-0000-0000-0000-00000000000b') = date '2000-05-10', 'perfil';
  assert (select cardinality(schedule_ids) from signup_requests where student_id = s) = 2, 'dos horarios';
  assert (select status from signup_requests where student_id = s) = 'pending', 'pendiente';
  -- Si la vuelve a enviar, se actualiza la misma.
  perform submit_signup('self', '', '', '40123456', date '2000-05-10', '11 5555-1234', null,
                        array(select id from sch where weekday = 1), null);
  assert (select count(*) from signup_requests) = 1, 'una sola pendiente';
  assert (select cardinality(schedule_ids) from signup_requests) = 1, 'actualizada';
  raise notice 'OK  inscripción propia';
end $$;
do $$
begin
  perform submit_signup('self', '', '', '40123456', date '2000-05-10', '11 5555-1234', null,
                        array(select id from sch where weekday = 5), null);
  raise exception 'horario terminado';
exception when no_data_found then
  raise notice 'OK  horario vencido rechazado';
end $$;
do $$
begin
  perform submit_signup('self', '', '', '40123456', date '2000-05-10', '11 5555-1234', null, '{}', null);
  raise exception 'sin horarios';
exception when invalid_parameter_value then
  raise notice 'OK  sin horarios rechazado';
end $$;

-- 2. Laura anota a su hijo Mateo: ficha nueva, queda como tutora.
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
declare s uuid;
begin
  s := submit_signup('child', ' Mateo ', 'Fernández', '55123456', date '2018-03-02', '11 4444-0000', 'madre',
                     array(select id from sch where weekday = 3), null);
  assert (select first_name || ' ' || last_name from students where id = s) = 'Mateo Fernández', 'nombre del chico';
  assert (select profile_id from students where id = s) is null, 'sin cuenta propia';
  assert is_my_student(s), 'Laura lo ve';
  assert exists (select 1 from my_students() where student_id = s), 'en su selector';
  assert exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.profile_id = 'c0000000-0000-0000-0000-00000000000c' and r.code = 'guardian'), 'rol tutor';
  assert (select count(*) from signup_requests) = 1, 've sólo la suya';
  -- Repetir con el mismo DNI reutiliza la ficha.
  assert submit_signup('child', 'Mateo', 'Fernández', '55123456', date '2018-03-02', '11 4444-0000', 'madre',
                       array(select id from sch where weekday = 1), null) = s, 'misma ficha';
  raise notice 'OK  la madre anota a su hijo';
end $$;

-- 3. Otra cuenta no puede usar un DNI ya cargado.
set local request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-00000000000c"}';
do $$
begin
  perform submit_signup('child', 'Mateo', 'F', '55123456', date '2018-03-02', '11 4444-0000', 'padre',
                        array(select id from sch where weekday = 1), null);
  raise exception 'DNI ajeno';
exception when unique_violation then
  raise notice 'OK  DNI de otro alumno protegido';
end $$;
do $$
begin
  perform submit_signup('self', '', '', '40123456', date '1990-01-01', '11 4444-0000', null,
                        array(select id from sch where weekday = 1), null);
  raise exception 'DNI de Valentina';
exception when unique_violation then
  raise notice 'OK  DNI propio repetido protegido';
end $$;
do $$
begin
  assert not exists (select 1 from signup_requests), 'no ve las de otros';
  perform resolve_signup((select id from signup_requests limit 1), 'dismissed');
  raise exception 'un alumno no resuelve';
exception when insufficient_privilege then
  raise notice 'OK  sólo el personal resuelve';
end $$;

-- 4. Recepción ve las pendientes; al darle la cuota a Mateo se confirma sola; descarta otra.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  assert (select count(*) from signup_requests where status = 'pending') = 2, format('dos pendientes: %s', (select count(*) from signup_requests));
  raise notice 'OK  recepción ve las pendientes';
end $$;
-- La cuota se crea como lo hace recepción (con su sesión); acá se inserta directo.
reset role;
insert into memberships (academy_id, student_id, plan_id, teacher_id, age_category_id, anchor_day)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'), g.teacher_id, g.age_category_id, 1
from students s, class_groups g where s.dni = '55123456';
set local role authenticated;
do $$
begin
  assert (select r.status from signup_requests r join students s on s.id = r.student_id where s.dni = '55123456') = 'confirmed', 'confirmada sola';
  perform resolve_signup((select r.id from signup_requests r join students s on s.id = r.student_id where s.dni = '40123456'), 'dismissed');
  assert (select r.status from signup_requests r join students s on s.id = r.student_id where s.dni = '40123456') = 'dismissed', 'descartada';
  assert (select r.handled_by from signup_requests r join students s on s.id = r.student_id where s.dni = '40123456') = 'a0000000-0000-0000-0000-00000000000a', 'quién';
  raise notice 'OK  recepción resuelve';
end $$;
do $$
begin
  perform resolve_signup((select r.id from signup_requests r join students s on s.id = r.student_id where s.dni = '40123456'), 'confirmed');
  raise exception 'ya resuelta';
exception when no_data_found then
  raise notice 'OK  no se resuelve dos veces';
end $$;

-- 5. Los profes no ven inscripciones.
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
begin
  assert not exists (select 1 from signup_requests), 'la profe no ve inscripciones';
  raise notice 'OK  profes sin acceso';
end $$;

rollback;
