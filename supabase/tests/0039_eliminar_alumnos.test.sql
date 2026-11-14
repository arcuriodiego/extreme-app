-- Pruebas de eliminar alumnos creados por error. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'error@example.com', '{"first_name":"Cuenta","last_name":"Por Error","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');

-- Ficha sin cuenta, cargada en recepción.
reset role;
insert into students (academy_id, first_name, last_name, dni)
select id, 'Sin', 'Cuenta', '40111222' from academies where slug = 'extreme-dance';
-- Valentina tiene historial: un cargo.
insert into charges (academy_id, student_id, concept, due_date, description, amount_cents)
select academy_id, id, 'other', current_date, 'Algo', 100000 from students where first_name = 'Valentina';
set local role authenticated;

-- 1. Recepción no puede eliminar.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform delete_student((select id from students where first_name = 'Sin'));
  raise exception 'recepción eliminó';
exception when insufficient_privilege then
  raise notice 'OK  sólo administración';
end $$;

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';

-- 2. Con historial no se elimina (y queda todo como estaba).
do $$
begin
  perform delete_student((select id from students where first_name = 'Valentina'));
  raise exception 'eliminó con historial';
exception when foreign_key_violation then
  raise notice 'OK  con historial no';
end $$;

-- 3. Su propia ficha, no.
do $$
begin
  perform delete_student((select id from students where first_name = 'Diego'));
  raise exception 'eliminó la propia';
exception when invalid_parameter_value then
  raise notice 'OK  la propia no';
end $$;

-- 4. Ficha sin cuenta: se elimina.
do $$
declare r jsonb;
begin
  r := delete_student((select id from students where first_name = 'Sin'));
  assert r->>'name' = 'Sin Cuenta' and (r->>'account_deleted')::boolean = false, r::text;
  assert not exists (select 1 from students where first_name = 'Sin'), 'ficha borrada';
  raise notice 'OK  ficha sin cuenta';
end $$;

-- 5. Cuenta de alumno creada por error: se borran la ficha y la cuenta.
do $$
declare r jsonb;
begin
  r := delete_student((select id from students where first_name = 'Cuenta'));
  assert (r->>'account_deleted')::boolean, r::text;
  raise notice 'OK  cuenta por error';
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from auth.users where email = 'error@example.com'), 'usuario borrado';
  assert not exists (select 1 from profiles where email = 'error@example.com'), 'perfil borrado';
  raise notice 'OK  puede volver a registrarse';
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';

-- 6. Una cuenta del personal no se borra: sólo su ficha y el rol Alumno.
do $$
declare r jsonb;
begin
  r := delete_student((select id from students where first_name = 'Paula'));
  assert (r->>'account_deleted')::boolean = false, r::text;
  raise notice 'OK  cuenta del personal se conserva';
end $$;
reset role;
do $$
begin
  assert exists (select 1 from profiles where email = 'paula@example.com'), 'perfil sigue';
  assert exists (select 1 from user_roles ur join roles r on r.id = ur.role_id join profiles p on p.id = ur.profile_id
                 where p.email = 'paula@example.com' and r.code = 'reception'), 'sigue en recepción';
  assert not exists (select 1 from user_roles ur join roles r on r.id = ur.role_id join profiles p on p.id = ur.profile_id
                     where p.email = 'paula@example.com' and r.code = 'student'), 'sin rol alumno';
  raise notice 'OK  rol Alumno quitado';
end $$;

rollback;
