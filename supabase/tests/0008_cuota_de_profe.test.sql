-- Pruebas de la cuota de profe: inscripción, cupo, cambios y bajas. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'martina@example.com', '{"first_name":"Martina","academy":"extreme-dance"}'),
  ('f0000000-0000-0000-0000-00000000000f', 'lucia@example.com', '{"first_name":"Lucía","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('b1000000-0000-0000-0000-00000000000b', 'sofi@example.com', '{"first_name":"Sofía","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
-- Precio único (sin recargo por otros medios): estas pruebas son anteriores al precio en efectivo (0030).
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
select grant_role('f0000000-0000-0000-0000-00000000000f', 'teacher');

insert into rooms (branch_id, name, capacity) values ((select id from branches limit 1), 'Sala 1', 25), ((select id from branches limit 1), 'Sala 2', 25);

-- Martina: Hip Hop Teens (cupo 1, para probar el límite) martes y jueves; Lucía: Heels Adultos el miércoles.
create temp table g (name text, id uuid);
grant all on g to authenticated;
with ins as (
  insert into class_groups (style_id, age_category_id, teacher_id, capacity)
  values ((select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Teens'),
          (select id from teachers where display_name = 'Martina'), 1)
  returning id)
insert into g select 'martina', id from ins;
with ins as (
  insert into class_groups (style_id, age_category_id, teacher_id, capacity)
  values ((select id from dance_styles where name = 'Heels'), (select id from age_categories where name = 'Adultos'),
          (select id from teachers where display_name = 'Lucía'), 10)
  returning id)
insert into g select 'lucia', id from ins;

insert into class_schedules (group_id, weekday, start_time, end_time, room_id) values
  ((select id from g where name = 'martina'), 2, '19:00', '20:30', (select id from rooms where name = 'Sala 1')),
  ((select id from g where name = 'martina'), 4, '19:00', '20:30', (select id from rooms where name = 'Sala 1')),
  ((select id from g where name = 'martina'), 5, '19:00', '20:30', (select id from rooms where name = 'Sala 1')),
  ((select id from g where name = 'lucia'), 3, '19:00', '20:30', (select id from rooms where name = 'Sala 2'));

create temp table ids as
select
  (select id from students where first_name = 'Valentina') as vale,
  (select id from students where first_name = 'Sofía') as sofi,
  (select id from teachers where display_name = 'Martina') as martina,
  (select id from teachers where display_name = 'Lucía') as lucia,
  (select id from age_categories where name = 'Teens') as teens,
  (select s.id from class_schedules s join g on g.id = s.group_id where g.name = 'martina' and s.weekday = 2) as mar,
  (select s.id from class_schedules s join g on g.id = s.group_id where g.name = 'martina' and s.weekday = 4) as jue,
  (select s.id from class_schedules s join g on g.id = s.group_id where g.name = 'martina' and s.weekday = 5) as vie,
  (select s.id from class_schedules s join g on g.id = s.group_id where g.name = 'lucia') as mie_lucia;
grant select on ids to authenticated;

-- 1. Inscripción con 2 horarios del mismo profe y categoría.
do $$
declare i ids; v_m uuid;
begin
  select * into i from ids;
  v_m := enroll_teacher_monthly(i.vale, i.martina, i.teens, array[i.mar, i.jue]);
  assert (select count(*) from enrollments where membership_id = v_m and status = 'active') = 2, '2 plazas fijas';
  assert (select anchor_day from memberships where id = v_m) is null, 'sin vencimiento hasta el primer pago';
  assert (select fixed from schedule_fixed_counts() where schedule_id = i.mar) = 1, 'conteo de fijos';
  raise notice 'OK  inscripción';
end $$;

-- 2. Reglas de la selección: cantidad exacta, distintos, del profe y categoría elegidos.
do $$
declare i ids;
begin
  select * into i from ids;
  begin
    perform enroll_teacher_monthly(i.sofi, i.martina, i.teens, array[i.vie]);
    raise exception 'debió pedir 2 horarios';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform enroll_teacher_monthly(i.sofi, i.martina, i.teens, array[i.vie, i.vie]);
    raise exception 'debió pedir horarios distintos';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform enroll_teacher_monthly(i.sofi, i.martina, i.teens, array[i.vie, i.mie_lucia]);
    raise exception 'debió rechazar el horario de otro profe';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK  reglas de la selección';
end $$;

-- 3. Cupo: el martes está completo (cupo 1).
do $$
declare i ids;
begin
  select * into i from ids;
  begin
    perform enroll_teacher_monthly(i.sofi, i.martina, i.teens, array[i.mar, i.vie]);
    raise exception 'debió rechazar por cupo';
  exception when raise_exception then
    if sqlerrm not like 'No hay lugar%' then raise; end if;
  end;
  assert not exists (select 1 from memberships where student_id = i.sofi), 'no quedó nada a medias';
  raise notice 'OK  cupo respetado';
end $$;

-- 4. Cambio de horario: Vale pasa del martes al viernes y libera el martes.
do $$
declare i ids;
begin
  select * into i from ids;
  perform change_enrollment((select id from enrollments where student_id = i.vale and schedule_id = i.mar and status = 'active'), i.vie);
  assert exists (select 1 from enrollments where student_id = i.vale and schedule_id = i.vie and status = 'active'), 'nuevo horario';
  assert exists (select 1 from enrollments where student_id = i.vale and schedule_id = i.mar and status = 'ended'), 'el viejo queda en el historial';
  begin
    perform change_enrollment((select id from enrollments where student_id = i.vale and schedule_id = i.vie and status = 'active'), i.jue);
    raise exception 'no debió repetir un horario que ya tiene';
  exception when unique_violation then null;
  end;
  raise notice 'OK  cambio de horario';
end $$;

-- 5. Protecciones: no se borra un horario con fijos ni se cierra su grupo.
do $$
declare i ids;
begin
  select * into i from ids;
  begin
    perform remove_schedule(i.jue);
    raise exception 'no debió quitar un horario con fijos';
  exception when raise_exception then
    if sqlerrm not like 'Ese horario tiene alumnos fijos%' then raise; end if;
  end;
  begin
    update class_groups set status = 'closed' where id = (select id from g where name = 'martina');
    raise exception 'no debió cerrar el grupo';
  exception when raise_exception then
    if sqlerrm not like 'Ese grupo tiene alumnos fijos%' then raise; end if;
  end;
  -- El martes tuvo fijos (historial): se da por terminado en lugar de borrarse.
  assert remove_schedule(i.mar) = 'ended', 'horario con historial se termina';
  assert (select valid_to from class_schedules where id = i.mar) is not null, 'con fecha de fin';
  raise notice 'OK  protecciones de horarios y grupos';
end $$;

-- 6. La alumna ve su cuota y sus horarios, no los de otros; no puede inscribirse sola.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare i ids;
begin
  select * into i from ids;
  assert (select count(*) from memberships) = 1, 've su cuota';
  assert (select count(*) from enrollments where status = 'active') = 2, 've sus horarios';
  assert (select count(*) from schedule_fixed_counts()) >= 2, 've cuántos fijos hay, sin ver quiénes';
  begin
    perform enroll_teacher_monthly(i.vale, i.martina, i.teens, array[i.jue, i.vie]);
    raise exception 'la alumna no debe inscribirse sola';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la alumna ve lo suyo';
end $$;

-- 7. Baja: termina la cuota y libera los lugares.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare i ids;
begin
  select * into i from ids;
  perform end_membership((select id from memberships where student_id = i.vale), 'Se mudó');
  assert (select status from memberships where student_id = i.vale) = 'ended', 'cuota terminada';
  assert not exists (select 1 from enrollments where student_id = i.vale and status = 'active'), 'sin plazas activas';
  assert coalesce((select fixed from schedule_fixed_counts() where schedule_id = i.jue), 0) = 0, 'lugar liberado';
  update class_groups set status = 'closed' where id = (select id from g where name = 'martina');
  raise notice 'OK  baja';
end $$;

reset role;
rollback;
