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

rollback;
