-- Pruebas de imágenes: flyer de workshop y foto de profe. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'agus@example.com', '{"first_name":"Agustina","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
insert into workshops (title, teacher_name, price_cents, capacity, status) values ('Mati Napp', 'Mati Napp', 3000000, 20, 'published');
reset role;

create temp table ids as
select (select id from academies limit 1) as academy,
       (select id from workshops limit 1) as workshop,
       (select id from teachers limit 1) as teacher;
grant select on ids to authenticated;

-- 0. El bucket existe, es público y limita tamaño y tipo.
do $$
begin
  assert (select public from storage.buckets where id = 'imagenes'), 'bucket público';
  assert (select file_size_limit from storage.buckets where id = 'imagenes') = 3145728, 'hasta 3 MB';
  assert (select allowed_mime_types from storage.buckets where id = 'imagenes') @> array['image/jpeg'], 'jpg';
  raise notice 'OK  bucket';
end $$;

-- 1. Administración sube el flyer y lo guarda en el workshop; también la foto del profe.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare a text; w text; t text;
begin
  select academy::text, workshop::text, teacher::text into a, w, t from ids;
  insert into storage.objects (bucket_id, name) values ('imagenes', a || '/workshops/' || w || '/flyer0001.jpg');
  insert into storage.objects (bucket_id, name) values ('imagenes', a || '/profes/' || t || '/foto00001.webp');
  update workshops set image_path = a || '/workshops/' || w || '/flyer0001.jpg';
  update teachers set photo_path = a || '/profes/' || t || '/foto00001.webp';
  assert (select image_path from workshops) like '%/flyer0001.jpg', 'flyer guardado';
  assert (select photo_path from teachers) like '%/foto00001.webp', 'foto guardada';
  raise notice 'OK  administración sube y guarda';
end $$;

-- 2. La ruta tiene que ser de la academia y del mismo workshop o profe.
do $$
declare a text; w text; t text;
begin
  select academy::text, workshop::text, teacher::text into a, w, t from ids;
  begin
    update workshops set image_path = a || '/workshops/' || t || '/flyer0002.jpg';
    raise exception 'ruta de otro workshop';
  exception when check_violation then null;
  end;
  begin
    update workshops set image_path = gen_random_uuid()::text || '/workshops/' || w || '/flyer0002.jpg';
    raise exception 'ruta de otra academia';
  exception when check_violation then null;
  end;
  begin
    update teachers set photo_path = a || '/workshops/' || t || '/foto00002.jpg';
    raise exception 'carpeta equivocada';
  exception when check_violation then null;
  end;
  begin
    update workshops set image_path = a || '/workshops/' || w || '/flyer.gif';
    raise exception 'tipo no permitido';
  exception when check_violation then null;
  end;
  raise notice 'OK  rutas controladas';
end $$;

-- 3. Fuera de la carpeta de la academia, no se sube.
do $$
begin
  insert into storage.objects (bucket_id, name) values ('imagenes', gen_random_uuid()::text || '/workshops/x/flyer.jpg');
  raise exception 'otra academia';
exception when insufficient_privilege then
  raise notice 'OK  carpeta de otra academia protegida';
end $$;

-- 4. Recepción y profes no suben ni cambian imágenes.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare a text; w text;
begin
  select academy::text, workshop::text into a, w from ids;
  begin
    insert into storage.objects (bucket_id, name) values ('imagenes', a || '/workshops/' || w || '/recepcion1.jpg');
    raise exception 'recepción no sube';
  exception when insufficient_privilege then null;
  end;
  update workshops set image_path = null;
  raise notice 'OK  recepción no sube';
end $$;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
declare a text; t text;
begin
  select academy::text, teacher::text into a, t from ids;
  begin
    insert into storage.objects (bucket_id, name) values ('imagenes', a || '/profes/' || t || '/selfie001.jpg');
    raise exception 'la profe no sube';
  exception when insufficient_privilege then null;
  end;
  update teachers set photo_path = null;
  delete from storage.objects;
  raise notice 'OK  la profe no sube';
end $$;
reset role;
do $$
begin
  assert (select image_path from workshops) is not null, 'recepción no borró el flyer';
  assert (select photo_path from teachers) is not null, 'la profe no borró su foto';
  assert (select count(*) from storage.objects) = 2, 'nadie más borró archivos';
  raise notice 'OK  nada cambió';
end $$;

-- 5. Los alumnos ven el flyer del workshop publicado y la foto del profe.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select image_path from workshops) is not null, 've el flyer';
  assert (select photo_path from teachers) is not null, 've la foto';
  raise notice 'OK  alumnos ven las imágenes';
end $$;

-- 6. Administración borra el archivo y lo quita.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  delete from storage.objects where name like '%/flyer0001.jpg';
  update workshops set image_path = null;
  assert (select image_path from workshops) is null, 'flyer quitado';
  raise notice 'OK  administración quita el flyer';
end $$;

rollback;
