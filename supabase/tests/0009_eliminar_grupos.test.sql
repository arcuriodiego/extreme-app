-- Pruebas de eliminación de grupos. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'martina@example.com', '{"first_name":"Martina","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
insert into rooms (branch_id, name, capacity) values ((select id from branches limit 1), 'Sala 1', 25);

create temp table g (name text, id uuid);
grant all on g to authenticated;
with ins as (insert into class_groups (style_id, age_category_id, teacher_id, capacity)
  values ((select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Teens'),
          (select id from teachers limit 1), 10) returning id)
insert into g select 'limpio', id from ins;
with ins as (insert into class_groups (style_id, age_category_id, teacher_id, capacity)
  values ((select id from dance_styles where name = 'Heels'), (select id from age_categories where name = 'Teens'),
          (select id from teachers limit 1), 10) returning id)
insert into g select 'con_fijos', id from ins;

insert into class_schedules (group_id, weekday, start_time, end_time, room_id) values
  ((select id from g where name = 'limpio'), 1, '18:00', '19:00', (select id from rooms limit 1)),
  ((select id from g where name = 'con_fijos'), 2, '18:00', '19:00', (select id from rooms limit 1)),
  ((select id from g where name = 'con_fijos'), 4, '18:00', '19:00', (select id from rooms limit 1));

select enroll_teacher_monthly((select id from students where first_name = 'Valentina'), (select id from teachers limit 1),
  (select id from age_categories where name = 'Teens'),
  array(select id from class_schedules where group_id = (select id from g where name = 'con_fijos')));

-- 0. Quitar un horario sin historial lo borra de verdad (corrección de la 0006).
do $$
declare v uuid;
begin
  insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
  values ((select id from g where name = 'limpio'), 5, '18:00', '19:00', (select id from rooms limit 1)) returning id into v;
  assert remove_schedule(v) = 'deleted', 'informa borrado';
  assert not exists (select 1 from class_schedules where id = v), 'el horario ya no existe';
  assert not exists (select 1 from class_sessions where schedule_id = v), 'sin clases';
  raise notice 'OK  quitar horario borra de verdad';
end $$;

-- 1. Un grupo sin historial se borra del todo, con sus horarios y clases futuras.
do $$
declare v uuid := (select id from g where name = 'limpio');
begin
  assert exists (select 1 from class_sessions where group_id = v), 'tenía clases futuras';
  assert delete_group(v) = 'deleted', 'borrado';
  assert not exists (select 1 from class_groups where id = v), 'ya no existe';
  assert not exists (select 1 from class_schedules where group_id = v), 'sin horarios';
  assert not exists (select 1 from class_sessions where group_id = v), 'sin clases';
  raise notice 'OK  grupo sin historial se borra';
end $$;

-- 2. Con alumnos fijos activos no se puede.
do $$
begin
  perform delete_group((select id from g where name = 'con_fijos'));
  raise exception 'no debió eliminar con fijos';
exception when raise_exception then
  if sqlerrm not like 'Ese grupo tiene alumnos fijos%' then raise; end if;
  raise notice 'OK  con fijos activos no se elimina';
end $$;

-- 3. Después de la baja, tiene historial: se cierra en lugar de borrarse.
do $$
declare v uuid := (select id from g where name = 'con_fijos');
begin
  perform end_membership((select id from memberships limit 1), 'prueba');
  assert delete_group(v) = 'archived', 'archivado';
  assert (select status from class_groups where id = v) = 'closed', 'queda cerrado';
  assert not exists (select 1 from class_sessions where group_id = v and starts_at > now()), 'sin clases futuras';
  raise notice 'OK  grupo con historial se cierra';
end $$;

-- 4. Una alumna no puede eliminar grupos.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  perform delete_group((select id from g where name = 'con_fijos'));
  raise exception 'la alumna no debe eliminar grupos';
exception when insufficient_privilege then
  raise notice 'OK  sólo administración elimina';
end $$;

reset role;
rollback;
