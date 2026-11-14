-- Pruebas de fotos propias: el profe sube la suya; fotos de alumnos privadas. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'agus@example.com', '{"first_name":"Agustina","academy":"extreme-dance"}'),
  ('f0000000-0000-0000-0000-00000000000f', 'rodri@example.com', '{"first_name":"Rodri","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'mama@example.com', '{"first_name":"Laura","academy":"extreme-dance"}'),
  ('99000000-0000-0000-0000-000000000099', 'otro@example.com', '{"first_name":"Otro","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
select grant_role('f0000000-0000-0000-0000-00000000000f', 'teacher');
reset role;

-- Valentina es adulta; Mateo es menor y su tutora es Laura.
update students set birth_date = '1995-05-05' where first_name = 'Valentina';
insert into students (academy_id, first_name, last_name, birth_date)
select id, 'Mateo', 'Hijo', current_date - interval '10 years' from academies where slug = 'extreme-dance';
insert into guardians (academy_id, profile_id)
select academy_id, id from profiles where email = 'mama@example.com';
insert into guardian_students (academy_id, guardian_id, student_id, relationship, is_primary)
select g.academy_id, g.id, s.id, 'madre', true from guardians g, students s where s.first_name = 'Mateo';

create temp table ids as
select (select id from academies where slug = 'extreme-dance') as academy,
       (select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'agus@example.com') as agus,
       (select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'rodri@example.com') as rodri,
       (select id from students where first_name = 'Valentina') as vale,
       (select id from students where first_name = 'Mateo') as mateo;
grant select on ids to authenticated;

-- 1. El profe sube y guarda su propia foto.
set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
declare a text; t text; prev text;
begin
  select academy::text, agus::text into a, t from ids;
  insert into storage.objects (bucket_id, name) values ('imagenes', a || '/profes/' || t || '/miFoto001.jpg');
  prev := set_teacher_photo(t::uuid, a || '/profes/' || t || '/miFoto001.jpg');
  assert prev is null, 'no tenía foto';
  assert (select photo_path from teachers where id = t::uuid) like '%/miFoto001.jpg', 'guardada';
  -- y la reemplaza: devuelve la anterior para borrarla
  insert into storage.objects (bucket_id, name) values ('imagenes', a || '/profes/' || t || '/miFoto002.jpg');
  prev := set_teacher_photo(t::uuid, a || '/profes/' || t || '/miFoto002.jpg');
  assert prev like '%/miFoto001.jpg', 'devuelve la anterior';
  delete from storage.objects where name = prev;
  assert not exists (select 1 from storage.objects where name = prev), 'borra la vieja';
  raise notice 'OK  el profe cambia su foto';
end $$;

-- 2. Un profe no toca la foto de otro.
do $$
declare a text; r text;
begin
  select academy::text, rodri::text into a, r from ids;
  begin
    insert into storage.objects (bucket_id, name) values ('imagenes', a || '/profes/' || r || '/ajena0001.jpg');
    raise exception 'subió en la carpeta de otro profe';
  exception when insufficient_privilege then null;
  end;
  begin
    perform set_teacher_photo(r::uuid, null);
    raise exception 'cambió la foto de otro profe';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sólo la propia';
end $$;

-- 3. Alumna adulta: sube su foto; el bucket es privado.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare a text; v text;
begin
  select academy::text, vale::text into a, v from ids;
  assert not (select public from storage.buckets where id = 'fotos'), 'bucket privado';
  insert into storage.objects (bucket_id, name) values ('fotos', a || '/alumnos/' || v || '/vale00001.jpg');
  perform set_student_photo(v::uuid, a || '/alumnos/' || v || '/vale00001.jpg');
  assert (select photo_path from students where id = v::uuid) like '%/vale00001.jpg', 'guardada';
  raise notice 'OK  alumna adulta sube su foto';
end $$;

-- 4. El menor no la sube solo; su tutora sí.
reset role;
-- Mateo tiene su propia cuenta (la de "Otro"), pero es menor.
delete from students where first_name = 'Otro';
update students set profile_id = (select id from profiles where email = 'otro@example.com') where first_name = 'Mateo';
set local role authenticated;
set local request.jwt.claims = '{"sub":"99000000-0000-0000-0000-000000000099"}';
do $$
declare a text; m text;
begin
  select academy::text, mateo::text into a, m from ids;
  assert not can_manage_student_photo(m::uuid), 'el menor no';
  begin
    perform set_student_photo(m::uuid, null);
    raise exception 'el menor cambió su foto';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  el menor no la sube solo';
end $$;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
declare a text; m text;
begin
  select academy::text, mateo::text into a, m from ids;
  insert into storage.objects (bucket_id, name) values ('fotos', a || '/alumnos/' || m || '/mateo0001.jpg');
  perform set_student_photo(m::uuid, a || '/alumnos/' || m || '/mateo0001.jpg');
  assert (select count(*) from storage.objects where bucket_id = 'fotos') = 1, 'la tutora ve sólo la de su hijo';
  raise notice 'OK  la tutora sube la foto del menor';
end $$;

-- 5. Otro alumno no ve ni sube fotos ajenas; recepción ve todas y puede cambiarlas.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare a text; m text;
begin
  select academy::text, mateo::text into a, m from ids;
  assert (select count(*) from storage.objects where bucket_id = 'fotos') = 1, 'Valentina ve sólo la suya';
  begin
    insert into storage.objects (bucket_id, name) values ('fotos', a || '/alumnos/' || m || '/ajena0001.jpg');
    raise exception 'subió una foto ajena';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  fotos ajenas no';
end $$;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare v text; prev text;
begin
  select vale::text into v from ids;
  assert (select count(*) from storage.objects where bucket_id = 'fotos') = 2, 'recepción ve todas';
  prev := set_student_photo(v::uuid, null);
  assert prev like '%/vale00001.jpg', 'devuelve la anterior';
  assert (select photo_path from students where id = v::uuid) is null, 'quitada';
  raise notice 'OK  recepción ve y cambia';
end $$;

-- 6. La ruta tiene que ser del mismo alumno.
do $$
declare a text; v text; m text;
begin
  select academy::text, vale::text, mateo::text into a, v, m from ids;
  perform set_student_photo(v::uuid, a || '/alumnos/' || m || '/mateo0001.jpg');
  raise exception 'aceptó la ruta de otro alumno';
exception when check_violation then
  raise notice 'OK  ruta del mismo alumno';
end $$;

rollback;
