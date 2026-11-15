-- Pruebas de elegir alumno o tutor en Inicio. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'mama@example.com', '{"first_name":"Laura","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'tutor@example.com', '{"first_name":"Tito","academy":"extreme-dance","account_type":"guardian"}');

do $$
begin
  assert (select account_kind from profiles where email = 'vale@example.com') is null, 'alumno sin elegir';
  assert (select account_kind from profiles where email = 'tutor@example.com') = 'guardian', 'registro de tutor';
  assert exists (select 1 from students s join profiles p on p.id = s.profile_id where p.email = 'mama@example.com'), 'arranca con ficha';
  raise notice 'OK  cuentas nuevas';
end $$;

-- 1. Laura elige tutor: pierde la ficha vacía y el rol Alumno; queda tutora.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
select choose_account_kind('guardian');
reset role;
do $$
begin
  assert (select account_kind from profiles where email = 'mama@example.com') = 'guardian', 'tutora';
  assert not exists (select 1 from students s join profiles p on p.id = s.profile_id where p.email = 'mama@example.com'), 'sin ficha';
  assert exists (select 1 from user_roles ur join roles r on r.id = ur.role_id join profiles p on p.id = ur.profile_id where p.email = 'mama@example.com' and r.code = 'guardian'), 'rol tutor';
  assert not exists (select 1 from user_roles ur join roles r on r.id = ur.role_id join profiles p on p.id = ur.profile_id where p.email = 'mama@example.com' and r.code = 'student'), 'sin rol alumno';
  assert exists (select 1 from guardians g join profiles p on p.id = g.profile_id where p.email = 'mama@example.com'), 'tutor creado';
  raise notice 'OK  elige tutor';
end $$;

-- 2. Valentina elige alumna: conserva su ficha.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select choose_account_kind('student');
reset role;
do $$
begin
  assert (select account_kind from profiles where email = 'vale@example.com') = 'student', 'alumna';
  assert exists (select 1 from students s join profiles p on p.id = s.profile_id where p.email = 'vale@example.com'), 'con ficha';
  raise notice 'OK  elige alumno';
end $$;

-- 3. Valor inválido.
set local role authenticated;
do $$
begin
  perform choose_account_kind('profe');
  raise exception 'aceptó cualquier cosa';
exception when invalid_parameter_value then
  raise notice 'OK  sólo alumno o tutor';
end $$;

rollback;
