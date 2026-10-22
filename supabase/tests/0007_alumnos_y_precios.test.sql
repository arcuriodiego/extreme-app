-- Pruebas de alumnos, notas internas y precios. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","last_name":"Rodríguez","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'sinnombre@example.com', '{"academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');

-- 1. Quien se registra tiene ficha de alumno; el nombre sale del perfil (o del email si no hay).
do $$
begin
  assert (select first_name || ' ' || last_name from students
          where profile_id = 'b0000000-0000-0000-0000-00000000000b') = 'Valentina Rodríguez', 'ficha con el nombre';
  assert (select first_name from students where profile_id = 'c0000000-0000-0000-0000-00000000000c') = 'sinnombre',
    'sin nombre usa el email';
  raise notice 'OK  ficha automática al registrarse';
end $$;

-- 2. Si la alumna cambia su nombre en la app, la ficha se actualiza.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
update profiles set first_name = 'Vale', birth_date = '2008-03-01' where id = auth.uid();
do $$
begin
  assert (select first_name from students where profile_id = auth.uid()) = 'Vale', 'nombre sincronizado';
  assert (select birth_date from students where profile_id = auth.uid()) = '2008-03-01', 'nacimiento sincronizado';
  assert (select count(*) from students) = 1, 'la alumna ve sólo su ficha';
  raise notice 'OK  sincronización con el perfil';
end $$;

-- 3. La alumna no puede crear fichas, cambiar su estado ni ver notas.
do $$
declare v_rows int;
begin
  begin
    insert into students (first_name) values ('Trucha');
    raise exception 'la alumna no debe crear fichas';
  exception when insufficient_privilege then null;
  end;
  update students set status = 'inactive';
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'no cambia su estado';
  raise notice 'OK  la alumna no gestiona fichas';
end $$;

-- 4. Recepción crea un alumno sin cuenta, edita la ficha y escribe una nota interna.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare v_id uuid;
begin
  insert into students (first_name, last_name, dni, birth_date) values ('Juana', 'Pérez', '50123456', '2015-06-01')
  returning id into v_id;
  update students set status = 'trial' where id = v_id;
  insert into student_notes (student_id, notes) values (v_id, 'Viene con la mamá los martes.');
  assert (select count(*) from students) = 5, 'recepción ve todas las fichas (4 con cuenta + 1 sin cuenta)';
  begin
    insert into students (first_name, dni) values ('Otra', '50123456');
    raise exception 'debió rechazar el DNI repetido';
  exception when unique_violation then null;
  end;
  begin
    insert into students (first_name, profile_id) values ('Falsa', 'b0000000-0000-0000-0000-00000000000b');
    raise exception 'no debe poder vincular una cuenta a mano';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  recepción gestiona fichas y notas';
end $$;

-- 5. La alumna sigue sin ver las notas, ni siquiera las suyas.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select count(*) from student_notes) = 0, 'las notas no se ven';
  raise notice 'OK  notas internas ocultas';
end $$;

-- 6. Planes y precios aprobados; precio vigente por fecha.
do $$
begin
  assert (select count(*) from plans) = 4, '4 planes';
  assert plan_price_on((select id from plans where name = 'Cuota de profe'), current_date) = 5550000, 'cuota $55.500';
  assert plan_price_on((select id from plans where name = 'Pack 10 clases'), current_date) = 6600000, 'pack 10 $66.000';
  assert plan_price_on((select id from plans where name = 'Pack 16 clases'), current_date) = 10300000, 'pack 16 $103.000';
  assert plan_price_on((select id from plans where name = 'Clase individual'), current_date) = 1150000, 'individual $11.500';
  begin
    perform set_plan_price((select id from plans where name = 'Cuota de profe'), 1, current_date + 1);
    raise exception 'la alumna no debe cambiar precios';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  precios aprobados';
end $$;

-- 7. Administración programa un aumento: rige desde su fecha, sin tocar el pasado.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare v_plan uuid := (select id from plans where name = 'Cuota de profe');
begin
  perform set_plan_price(v_plan, 6000000, current_date + 10);
  assert plan_price_on(v_plan, current_date) = 5550000, 'hoy sigue el precio actual';
  assert plan_price_on(v_plan, current_date + 10) = 6000000, 'desde la fecha, el nuevo';
  perform set_plan_price(v_plan, 5900000, current_date + 10);
  assert plan_price_on(v_plan, current_date + 10) = 5900000, 'el mismo día se corrige';
  begin
    perform set_plan_price(v_plan, 100, current_date - 1);
    raise exception 'no debe aceptar fechas pasadas';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform remove_plan_price((select id from plan_prices where plan_id = v_plan and valid_from = current_date));
    raise exception 'no debe quitar un precio vigente';
  exception when no_data_found then null;
  end;
  perform remove_plan_price((select id from plan_prices where plan_id = v_plan and valid_from = current_date + 10));
  assert plan_price_on(v_plan, current_date + 10) = 5550000, 'aumento cancelado';
  raise notice 'OK  aumentos programados';
end $$;

-- 8. Recepción no cambia precios.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  begin
    perform set_plan_price((select id from plans limit 1), 100, current_date + 1);
    raise exception 'recepción no debe cambiar precios';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sólo administración cambia precios';
end $$;

reset role;

-- 9. Precios y fichas quedan auditados.
do $$
begin
  assert exists (select 1 from audit_logs where table_name = 'plan_prices' and actor_id = 'd0000000-0000-0000-0000-00000000000d'),
    'precios auditados';
  assert exists (select 1 from audit_logs where table_name = 'students' and actor_id = 'a0000000-0000-0000-0000-00000000000a'),
    'fichas auditadas';
  raise notice 'OK  auditoría';
end $$;

rollback;
