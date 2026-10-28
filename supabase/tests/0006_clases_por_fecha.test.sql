-- Pruebas de clases por fecha, feriados y reemplazos. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'martina@example.com', '{"first_name":"Martina","academy":"extreme-dance"}'),
  ('f0000000-0000-0000-0000-00000000000f', 'lucia@example.com', '{"first_name":"Lucía","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
-- Precio único (sin recargo por otros medios): estas pruebas son anteriores al precio en efectivo (0030).
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';

-- Fecha de referencia: el martes de la semana que viene (siempre en el futuro).
create temp table ref as
select ((now() at time zone 'America/Argentina/Buenos_Aires')::date
        + (7 - extract(isodow from (now() at time zone 'America/Argentina/Buenos_Aires')::date)::int) + 2) as martes;
grant select on ref to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';

select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
select grant_role('f0000000-0000-0000-0000-00000000000f', 'teacher');

insert into rooms (branch_id, name, capacity) values
  ((select id from branches limit 1), 'Sala 1', 25),
  ((select id from branches limit 1), 'Sala 2', 25);

insert into class_groups (style_id, age_category_id, teacher_id, capacity)
values ((select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Teens'),
        (select id from teachers where display_name = 'Martina'), 20);

-- 1. Al cargar un horario se generan sus clases de las próximas 8 semanas, en hora de Buenos Aires.
insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
values ((select id from class_groups limit 1), 2, '19:00', '20:30', (select id from rooms where name = 'Sala 1'));

do $$
declare v_martes date := (select martes from ref);
begin
  assert (select count(*) from class_sessions) between 8 and 9, 'unas 8 clases (depende del día de hoy)';
  assert exists (select 1 from class_sessions
                 where starts_at = (v_martes + time '19:00') at time zone 'America/Argentina/Buenos_Aires'
                   and ends_at = (v_martes + time '20:30') at time zone 'America/Argentina/Buenos_Aires'
                   and capacity = 20 and status = 'scheduled'),
    'la clase del martes de referencia existe con hora local correcta';
  assert (select count(*) from room_occupancies) = (select count(*) from class_sessions), 'cada clase ocupa su sala';
  raise notice 'OK  generación de clases';
end $$;

-- 2. Generar otra vez no duplica; ensure_sessions corre una sola vez por día.
do $$
begin
  assert ensure_sessions() = 0, 'el horario recién cargado ya generó todo';
  assert ensure_sessions() = 0, 'la segunda vez en el día no hace nada';
  raise notice 'OK  generación idempotente';
end $$;

-- 3. Un feriado suspende las clases de ese día; al borrarlo vuelven.
do $$
declare
  v_martes date := (select martes from ref);
  v_id uuid;
begin
  v_id := add_calendar_exception(v_martes, 'Feriado nacional');
  assert (select status from class_sessions
          where (starts_at at time zone 'America/Argentina/Buenos_Aires')::date = v_martes) = 'cancelled', 'suspendida por feriado';
  assert (select cancel_reason from class_sessions where exception_id = v_id) = 'Feriado nacional', 'con el motivo';
  assert not exists (select 1 from room_occupancies o join class_sessions s on s.id = o.source_id where s.exception_id = v_id),
    'una clase suspendida libera la sala';
  begin
    perform restore_session((select id from class_sessions where exception_id = v_id));
    raise exception 'no debe reactivarse una clase suspendida por feriado';
  exception when no_data_found then null;
  end;
  perform remove_calendar_exception(v_id);
  assert (select status from class_sessions
          where (starts_at at time zone 'America/Argentina/Buenos_Aires')::date = v_martes) = 'scheduled', 'vuelve al borrar el feriado';
  raise notice 'OK  feriados';
end $$;

-- 4. Un horario nuevo que cae en un feriado ya cargado nace suspendido.
do $$
declare v_martes date := (select martes from ref);
begin
  perform add_calendar_exception(v_martes + 1, 'Cierre por mudanza', 'closure');
  insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
  values ((select id from class_groups limit 1), 3, '19:00', '20:30', (select id from rooms where name = 'Sala 1'));
  assert (select status from class_sessions
          where (starts_at at time zone 'America/Argentina/Buenos_Aires')::date = v_martes + 1) = 'cancelled', 'nace suspendida';
  raise notice 'OK  clases nuevas respetan los feriados';
end $$;

-- 5. Suspender y reactivar una clase puntual.
do $$
declare v_id uuid := (select id from class_sessions
                      where (starts_at at time zone 'America/Argentina/Buenos_Aires')::date = (select martes from ref) + 7);
begin
  begin
    perform cancel_session(v_id, '  ');
    raise exception 'debe pedir motivo';
  exception when invalid_parameter_value then null;
  end;
  perform cancel_session(v_id, 'La profe está de viaje');
  assert (select status from class_sessions where id = v_id) = 'cancelled', 'suspendida';
  perform restore_session(v_id);
  assert (select status from class_sessions where id = v_id) = 'scheduled', 'reactivada';
  raise notice 'OK  suspender y reactivar';
end $$;

-- 6. Reemplazo de profe, sin superposiciones.
do $$
declare
  v_martes date := (select martes from ref);
  v_session uuid := (select id from class_sessions
                     where (starts_at at time zone 'America/Argentina/Buenos_Aires')::date = v_martes);
  v_lucia uuid := (select id from teachers where display_name = 'Lucía');
  v_martina uuid := (select id from teachers where display_name = 'Martina');
  v_group uuid;
begin
  perform set_substitute(v_session, v_lucia);
  assert (select substitute_teacher_id from class_sessions where id = v_session) = v_lucia, 'Lucía reemplaza';

  -- Lucía tiene su propio grupo el mismo martes a la misma hora en la Sala 2: el horario semanal
  -- no se pisa (ella no da el grupo de Martina), pero esa fecha no se puede generar porque reemplaza.
  insert into class_groups (style_id, age_category_id, teacher_id, capacity)
  values ((select id from dance_styles where name = 'Heels'), (select id from age_categories where name = 'Adultos'), v_lucia, 15)
  returning id into v_group;
  insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
  values (v_group, 2, '19:30', '20:30', (select id from rooms where name = 'Sala 2'));
  assert not exists (select 1 from class_sessions where group_id = v_group
                     and (starts_at at time zone 'America/Argentina/Buenos_Aires')::date = v_martes),
    'la fecha en la que Lucía reemplaza no se genera';
  assert exists (select 1 from class_sessions where group_id = v_group
                 and (starts_at at time zone 'America/Argentina/Buenos_Aires')::date = v_martes + 7),
    'las otras semanas sí';

  -- Volver a poner a la profe titular quita el reemplazo.
  perform set_substitute(v_session, v_martina);
  assert (select substitute_teacher_id from class_sessions where id = v_session) is null, 'sin reemplazo';
  raise notice 'OK  reemplazos';
end $$;

-- 7. La grilla semanal no deja que un profe tenga dos grupos a la vez.
do $$
declare v_group uuid;
begin
  -- Martina da el grupo de los miércoles 19:00–20:30 en la Sala 1.
  insert into class_groups (style_id, age_category_id, teacher_id, capacity)
  values ((select id from dance_styles where name = 'Femme'), (select id from age_categories where name = 'Adultos'),
          (select id from teachers where display_name = 'Martina'), 15)
  returning id into v_group;
  begin
    insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
    values (v_group, 3, '20:00', '21:00', (select id from rooms where name = 'Sala 2'));
    raise exception 'debió rechazar al profe superpuesto';
  exception when raise_exception then
    if sqlerrm not like 'El profe ya tiene%' then raise; end if;
  end;

  -- Con el profe a confirmar se puede; después, asignarle a Martina se rechaza.
  update class_groups set teacher_id = null where id = v_group;
  insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
  values (v_group, 3, '20:00', '21:00', (select id from rooms where name = 'Sala 2'));
  begin
    update class_groups set teacher_id = (select id from teachers where display_name = 'Martina') where id = v_group;
    raise exception 'debió rechazar el cambio de profe';
  exception when raise_exception then
    if sqlerrm not like 'El profe ya tiene%' then raise; end if;
  end;
  raise notice 'OK  profe sin superposición semanal';
end $$;

-- 8. Pausar un grupo borra sus clases futuras; reactivarlo las vuelve a generar.
do $$
declare v_group uuid := (select g.id from class_groups g join teachers t on t.id = g.teacher_id
                         where t.display_name = 'Martina' order by g.created_at limit 1);
begin
  update class_groups set status = 'paused' where id = v_group;
  assert not exists (select 1 from class_sessions where group_id = v_group and starts_at > now()), 'sin clases futuras';
  update class_groups set status = 'active' where id = v_group;
  assert exists (select 1 from class_sessions where group_id = v_group and starts_at > now()), 'clases regeneradas';
  update class_groups set capacity = 18 where id = v_group;
  assert not exists (select 1 from class_sessions where group_id = v_group and starts_at > now() and capacity <> 18),
    'el cupo nuevo se aplica a las clases futuras';
  raise notice 'OK  cambios del grupo';
end $$;

-- 9. Una alumna ve las clases pero no puede cambiarlas.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select count(*) from class_sessions) > 0, 've las clases';
  assert (select count(*) from room_occupancies) = 0, 'no ve la ocupación interna de salas';
  begin
    perform cancel_session((select id from class_sessions limit 1), 'no voy');
    raise exception 'la alumna no debe suspender clases';
  exception when insufficient_privilege then null;
  end;
  begin
    perform generate_sessions((select academy_id from profiles limit 1));
    raise exception 'la alumna no debe generar clases';
  exception when insufficient_privilege then null;
  end;
  begin
    update class_sessions set status = 'cancelled', cancel_reason = 'x';
    raise exception 'nadie escribe la tabla directo';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la alumna sólo mira';
end $$;

reset role;
rollback;
