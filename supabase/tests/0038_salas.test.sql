-- Pruebas de editar y borrar salas. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');

insert into rooms (academy_id, branch_id, name, capacity)
select academy_id, id, n, 20 from branches, unnest(array['Sala de prueba', 'Sala con horarios']) n where branches.id = (select id from branches limit 1);

-- 1. Administración cambia nombre y capacidad.
do $$
begin
  update rooms set name = 'Sala Nueva', capacity = 25 where name = 'Sala de prueba';
  assert exists (select 1 from rooms where name = 'Sala Nueva' and capacity = 25), 'editada';
  raise notice 'OK  editar sala';
end $$;

-- 2. Recepción no puede borrar salas.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  delete from rooms where name = 'Sala Nueva';
  assert exists (select 1 from rooms where name = 'Sala Nueva'), 'recepción no borra';
  raise notice 'OK  sólo administración borra';
end $$;

-- 3. Una sala con horarios no se borra; una sin uso, sí.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare
  g uuid;
  used uuid := (select id from rooms where name = 'Sala con horarios');
begin
  insert into class_groups (style_id, age_category_id, capacity)
  values ((select id from dance_styles limit 1), (select id from age_categories limit 1), 10) returning id into g;
  insert into class_schedules (group_id, weekday, start_time, end_time, room_id) values (g, 3, '19:00', '20:00', used);
  begin
    delete from rooms where id = used;
    raise exception 'borró una sala con horarios';
  exception when foreign_key_violation then null;
  end;
  delete from rooms where name = 'Sala Nueva';
  assert not exists (select 1 from rooms where name = 'Sala Nueva'), 'borrada';
  raise notice 'OK  borrar sólo salas sin uso';
end $$;

rollback;
