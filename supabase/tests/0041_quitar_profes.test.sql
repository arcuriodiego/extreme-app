-- Pruebas de quitar profes cargados por error. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'barbara@example.com', '{"first_name":"Barbara","academy":"extreme-dance"}'),
  ('f0000000-0000-0000-0000-00000000000f', 'barbara2@example.com', '{"first_name":"Barbara","last_name":"Dos","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
select grant_role('f0000000-0000-0000-0000-00000000000f', 'teacher');
-- La primera Barbara tiene un grupo.
insert into class_groups (style_id, age_category_id, capacity, teacher_id)
values ((select id from dance_styles limit 1), (select id from age_categories limit 1), 10,
        (select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'barbara@example.com'));

-- 1. Recepción no puede.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform delete_teacher((select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'barbara2@example.com'));
  raise exception 'recepción quitó un profe';
exception when insufficient_privilege then
  raise notice 'OK  sólo administración';
end $$;

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';

-- 2. Con grupos no se quita (y conserva el rol).
do $$
begin
  perform delete_teacher((select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'barbara@example.com'));
  raise exception 'quitó un profe con grupos';
exception when foreign_key_violation then
  raise notice 'OK  con grupos no';
end $$;
do $$
begin
  assert exists (select 1 from teachers t join profiles p on p.id = t.profile_id where p.email = 'barbara@example.com' and t.active), 'sigue';
  raise notice 'OK  nada cambió';
end $$;

-- 3. El duplicado sin clases se quita y pierde el rol Profesor; la cuenta queda.
do $$
begin
  perform delete_teacher((select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'barbara2@example.com'));
  assert not exists (select 1 from teachers t join profiles p on p.id = t.profile_id where p.email = 'barbara2@example.com'), 'quitado';
  raise notice 'OK  duplicado quitado';
end $$;
reset role;
do $$
begin
  assert exists (select 1 from profiles where email = 'barbara2@example.com'), 'la cuenta sigue';
  assert not exists (select 1 from user_roles ur join roles r on r.id = ur.role_id join profiles p on p.id = ur.profile_id
                     where p.email = 'barbara2@example.com' and r.code = 'teacher'), 'sin rol profesor';
  raise notice 'OK  sin rol Profesor';
end $$;

-- 4. Profe cuyas clases se eliminaron con fechas pasadas pero sin nadie: se quita
--    junto con sus grupos cerrados. Otro con un ingreso registrado: no.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-0000-0000-0000000000c1', 'agos@example.com', '{"first_name":"Agos","academy":"extreme-dance"}'),
  ('c2000000-0000-0000-0000-0000000000c2', 'caro@example.com', '{"first_name":"Caro","academy":"extreme-dance"}');
insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala T', 25 from branches limit 1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('c1000000-0000-0000-0000-0000000000c1', 'teacher');
select grant_role('c2000000-0000-0000-0000-0000000000c2', 'teacher');
reset role;
insert into class_groups (academy_id, style_id, age_category_id, capacity, teacher_id, status)
select t.academy_id, (select id from dance_styles limit 1), (select id from age_categories limit 1), 10, t.id, 'closed'
from teachers t join profiles p on p.id = t.profile_id where p.email in ('agos@example.com', 'caro@example.com');
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, teacher_id, capacity)
select g.academy_id, g.id,
       now() - interval '2 days' - case when p.email = 'caro@example.com' then interval '3 hours' else interval '0' end,
       now() - interval '2 days' - case when p.email = 'caro@example.com' then interval '3 hours' else interval '0' end + interval '1 hour',
       (select id from rooms where name = 'Sala T'), g.teacher_id, 10
from class_groups g join teachers t on t.id = g.teacher_id join profiles p on p.id = t.profile_id
where p.email in ('agos@example.com', 'caro@example.com');
insert into students (academy_id, first_name, last_name) select id, 'Ana', 'Test' from academies;
insert into attendances (academy_id, student_id, session_id, source)
select cs.academy_id, (select id from students where first_name = 'Ana' and last_name = 'Test'), cs.id, 'manual'
from class_sessions cs join teachers t on t.id = cs.teacher_id join profiles p on p.id = t.profile_id
where p.email = 'caro@example.com';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  perform delete_teacher((select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'agos@example.com'));
  assert not exists (select 1 from teachers t join profiles p on p.id = t.profile_id where p.email = 'agos@example.com'), 'agos quitada';
  raise notice 'OK  con clases eliminadas sin nadie, se quita';
end $$;
do $$
begin
  perform delete_teacher((select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'caro@example.com'));
  raise exception 'quitó un profe con ingresos';
exception when foreign_key_violation then
  raise notice 'OK  con ingresos no';
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from class_groups g where g.teacher_id is null), 'sin grupos huérfanos';
  assert (select count(*) from class_groups g join teachers t on t.id = g.teacher_id join profiles p on p.id = t.profile_id
          where p.email = 'caro@example.com') = 1, 'el grupo de Caro sigue';
  assert (select count(*) from class_sessions cs join teachers t on t.id = cs.teacher_id join profiles p on p.id = t.profile_id
          where p.email = 'caro@example.com') = 1, 'su fecha sigue';
  raise notice 'OK  con historial no se borra nada';
end $$;

-- 5. A una clase se le cambió el profe: las fechas pasadas sin nadie pasan al
--    nuevo y el anterior se puede quitar. El aviso de historial dice qué es.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c3000000-0000-0000-0000-0000000000c3', 'vieja@example.com', '{"first_name":"Vieja","academy":"extreme-dance"}'),
  ('c4000000-0000-0000-0000-0000000000c4', 'nueva@example.com', '{"first_name":"Nueva","academy":"extreme-dance"}');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('c3000000-0000-0000-0000-0000000000c3', 'teacher');
select grant_role('c4000000-0000-0000-0000-0000000000c4', 'teacher');
reset role;
insert into class_groups (academy_id, style_id, age_category_id, capacity, teacher_id)
select t.academy_id, (select id from dance_styles limit 1), (select id from age_categories limit 1), 10, t.id
from teachers t join profiles p on p.id = t.profile_id where p.email = 'vieja@example.com';
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, teacher_id, capacity)
select g.academy_id, g.id, now() - interval '5 days', now() - interval '5 days' + interval '1 hour',
       (select id from rooms where name = 'Sala T'), g.teacher_id, 10
from class_groups g join teachers t on t.id = g.teacher_id join profiles p on p.id = t.profile_id
where p.email = 'vieja@example.com';
update class_groups set teacher_id = (select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'nueva@example.com')
where teacher_id = (select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'vieja@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  perform delete_teacher((select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'vieja@example.com'));
  assert not exists (select 1 from teachers t join profiles p on p.id = t.profile_id where p.email = 'vieja@example.com'), 'vieja quitada';
  raise notice 'OK  con fechas pasadas de una clase que cambió de profe, se quita';
end $$;
do $$
begin
  perform delete_teacher((select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'caro@example.com'));
  raise exception 'quitó un profe con ingresos';
exception when foreign_key_violation then
  assert sqlerrm like '%1 clase(s) con reservas, ingresos o compras%', sqlerrm;
  raise notice 'OK  el aviso dice qué la frena: %', sqlerrm;
end $$;
reset role;
do $$
begin
  assert (select count(*) from class_sessions cs join teachers t on t.id = cs.teacher_id join profiles p on p.id = t.profile_id
          where p.email = 'nueva@example.com' and cs.starts_at < now()) = 1, 'la fecha pasó a la nueva';
  raise notice 'OK  la fecha pasada quedó a nombre del profe actual';
end $$;

rollback;
