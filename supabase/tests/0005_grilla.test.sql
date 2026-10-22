-- Pruebas de la grilla académica. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","last_name":"Arcurio","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'martina@example.com', '{"first_name":"Martina","last_name":"Profe","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
insert into academies (slug, name) values ('otra-academia', 'Otra Academia');

select bootstrap_admin('diego@example.com');

-- 1. El catálogo aprobado se carga en cada academia.
do $$
declare v_ed uuid := (select id from academies where slug = 'extreme-dance');
begin
  assert (select count(*) from dance_styles where academy_id = v_ed) = 6, '6 estilos';
  assert (select count(*) from levels where academy_id = v_ed) = 2, '2 niveles';
  assert (select count(*) from age_categories where academy_id = v_ed) = 3, '3 categorías';
  assert (select count(*) from dance_styles d join academies a on a.id = d.academy_id where a.slug = 'otra-academia') = 6,
    'una academia nueva también recibe el catálogo';
  raise notice 'OK  catálogo inicial';
end $$;

-- 2. Al asignar el rol Profesor se crea su ficha; al quitarlo queda inactiva.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  perform grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
  assert (select display_name from teachers where profile_id = 'e0000000-0000-0000-0000-00000000000e') = 'Martina Profe',
    'ficha de profe creada con su nombre';
  perform revoke_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
  assert (select active from teachers where profile_id = 'e0000000-0000-0000-0000-00000000000e') = false, 'queda inactiva';
  perform grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
  assert (select active from teachers where profile_id = 'e0000000-0000-0000-0000-00000000000e') = true, 'vuelve a estar activa';
  assert (select count(*) from teachers) = 1, 'nunca se duplica';
  raise notice 'OK  ficha de profe sincronizada con el rol';
end $$;

-- 3. Administración crea sala, grupo y horario.
do $$
declare
  v_room uuid;
  v_group uuid;
begin
  insert into rooms (branch_id, name, capacity)
  values ((select id from branches limit 1), 'Sala 1', 25) returning id into v_room;
  insert into class_groups (style_id, age_category_id, level_id, teacher_id, capacity)
  values ((select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Teens'),
          (select id from levels where name = 'Principiante'), (select id from teachers limit 1), 20)
  returning id into v_group;
  insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
  values (v_group, 2, '19:00', '20:30', v_room);
  assert (select count(*) from class_schedules) = 1, 'horario creado';
  raise notice 'OK  administración carga la grilla';
end $$;

-- 4. La misma sala no puede tener dos horarios que se pisen.
do $$
declare
  v_room uuid := (select id from rooms where name = 'Sala 1');
  v_group uuid;
begin
  insert into class_groups (style_id, age_category_id, capacity)
  values ((select id from dance_styles where name = 'Heels'), (select id from age_categories where name = 'Adultos'), 15)
  returning id into v_group;

  begin
    insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
    values (v_group, 2, '20:00', '21:00', v_room);
    raise exception 'debió rechazar la superposición';
  exception when exclusion_violation then null;
  end;

  -- Justo a continuación sí se puede (20:30 a 22:00).
  insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
  values (v_group, 2, '20:30', '22:00', v_room);
  -- Otro día, mismo horario, también.
  insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
  values (v_group, 4, '19:00', '20:30', v_room);
  -- Mismo horario pero con vigencias que no se cruzan, también.
  update class_schedules set valid_to = current_date + 30 where weekday = 4;
  insert into class_schedules (group_id, weekday, start_time, end_time, room_id, valid_from)
  values (v_group, 4, '19:00', '20:30', v_room, current_date + 31);
  raise notice 'OK  sin superposición de salas';
end $$;

-- 5. Horarios inválidos se rechazan.
do $$
declare v_group uuid := (select id from class_groups limit 1);
begin
  begin
    insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
    values (v_group, 3, '20:00', '19:00', (select id from rooms limit 1));
    raise exception 'debió rechazar fin antes del inicio';
  exception when check_violation then null;
  end;
  begin
    insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
    values (v_group, 8, '19:00', '20:00', (select id from rooms limit 1));
    raise exception 'debió rechazar el día 8';
  exception when check_violation then null;
  end;
  raise notice 'OK  horarios inválidos rechazados';
end $$;

reset role;

-- 6. Un grupo no puede usar el estilo de otra academia.
do $$
begin
  begin
    insert into class_groups (academy_id, style_id, age_category_id, capacity)
    values ((select id from academies where slug = 'extreme-dance'),
            (select d.id from dance_styles d join academies a on a.id = d.academy_id where a.slug = 'otra-academia' and d.name = 'Hip Hop'),
            (select c.id from age_categories c join academies a on a.id = c.academy_id where a.slug = 'extreme-dance' and c.name = 'Teens'),
            10);
    raise exception 'debió rechazar el estilo de otra academia';
  exception when foreign_key_violation then null;
  end;
  raise notice 'OK  academias aisladas en la grilla';
end $$;

-- 7. Una alumna ve la grilla pero no la cambia.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare v_rows int;
begin
  assert (select count(*) from class_schedules) = 4, 've los horarios';
  assert (select count(*) from teachers) = 1, 've a los profes';
  assert (select count(*) from dance_styles) = 6, 've sólo los estilos de su academia';
  update class_groups set capacity = 99;
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'no cambia grupos';
  begin
    insert into dance_styles (name) values ('Tango');
    raise exception 'la alumna no debe crear estilos';
  exception when insufficient_privilege then null;
  end;
  begin
    update teachers set active = false;
    raise exception 'nadie cambia el estado del profe a mano';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la alumna sólo mira la grilla';
end $$;

reset role;

-- 8. Los cambios de la grilla quedan auditados.
do $$
begin
  assert exists (select 1 from audit_logs where table_name = 'class_schedules'
                 and actor_id = 'd0000000-0000-0000-0000-00000000000d'), 'horarios auditados con autor';
  raise notice 'OK  grilla auditada';
end $$;

rollback;
