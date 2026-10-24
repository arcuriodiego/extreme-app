-- =====================================================================
-- Entrega 18 · Imágenes: flyer de workshops y foto de profes.
--
-- Se guardan en Supabase Storage, bucket público "imagenes":
--   <academia>/<workshops|profes>/<id>/<nombre al azar>.<jpg|png|webp>
-- Las ve cualquiera con el enlace (son para mostrar en la app).
-- Sólo quien tiene classes.manage (administración) sube o borra, y sólo
-- dentro de la carpeta de su academia.
-- =====================================================================

-- Columnas: la ruta tiene que ser de la misma academia y del mismo workshop o profe.
alter table public.workshops
  add column image_path text
  constraint workshops_image_path_ok check (
    image_path ~ '^[0-9a-f-]{36}/workshops/[0-9a-f-]{36}/[A-Za-z0-9_-]{8,40}\.(jpg|png|webp)$'
    and split_part(image_path, '/', 1) = academy_id::text
    and split_part(image_path, '/', 3) = id::text
  );

alter table public.teachers
  add column photo_path text
  constraint teachers_photo_path_ok check (
    photo_path ~ '^[0-9a-f-]{36}/profes/[0-9a-f-]{36}/[A-Za-z0-9_-]{8,40}\.(jpg|png|webp)$'
    and split_part(photo_path, '/', 1) = academy_id::text
    and split_part(photo_path, '/', 3) = id::text
  );

-- Se cambia como el resto de los datos del profe (sólo administración, por la política existente).
grant update (photo_path) on public.teachers to authenticated;

-- Bucket público, con límite de tamaño y tipos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagenes', 'imagenes', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Quién sube, ve el listado y borra (la lectura de la imagen en sí es pública).
create policy "Administración sube imágenes de su academia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'imagenes'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and (storage.foldername(name))[2] in ('workshops', 'profes')
    and public.has_permission('classes.manage')
  );

create policy "Administración ve las imágenes de su academia" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imagenes'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and public.has_permission('classes.manage')
  );

create policy "Administración borra imágenes de su academia" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'imagenes'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and public.has_permission('classes.manage')
  );
