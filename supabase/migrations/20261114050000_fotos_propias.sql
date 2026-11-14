-- =====================================================================
-- Fotos propias (Diego, 14 nov).
--
-- 1. Cada profe puede subir o quitar su propia foto (la que ven los alumnos en la
--    grilla). Administración la sigue pudiendo cambiar.
-- 2. Foto de perfil de los alumnos, para que recepción reconozca a quien entra
--    (escáner y ficha). Es privada: bucket "fotos", sólo la ven el personal, el
--    propio alumno y sus tutores (con enlaces firmados). La suben:
--      · el propio alumno, si es mayor de edad;
--      · su madre, padre o tutor/a (siempre, para los menores);
--      · recepción o administración (people.manage), por ejemplo con la cámara.
--    Ruta: <academia>/alumnos/<alumno>/<nombre al azar>.<jpg|png|webp>
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Foto del profe
-- ---------------------------------------------------------------------

-- ¿Este profe es quien inició sesión?
create or replace function public.is_my_teacher(p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.teachers t where t.id = p_teacher_id and t.profile_id = auth.uid() and t.active);
$$;
revoke all on function public.is_my_teacher(uuid) from public, anon;
grant execute on function public.is_my_teacher(uuid) to authenticated;

-- La carpeta es la del profe (sin fallar si el nombre no es un uuid).
create or replace function public.folder_uuid(p_name text, p_index int)
returns uuid
language sql
immutable
as $$
  select case when (storage.foldername(p_name))[p_index] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(p_name))[p_index])::uuid end;
$$;

create policy "El profe sube su foto" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'imagenes'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and (storage.foldername(name))[2] = 'profes'
    and public.is_my_teacher(public.folder_uuid(name, 3))
  );

create policy "El profe ve sus fotos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imagenes'
    and (storage.foldername(name))[2] = 'profes'
    and public.is_my_teacher(public.folder_uuid(name, 3))
  );

create policy "El profe borra sus fotos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'imagenes'
    and (storage.foldername(name))[2] = 'profes'
    and public.is_my_teacher(public.folder_uuid(name, 3))
  );

-- Guardar la ruta: administración (classes.manage) o el propio profe.
-- Devuelve la ruta anterior, para borrar el archivo viejo.
create or replace function public.set_teacher_photo(p_teacher_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
begin
  if not exists (select 1 from public.teachers where id = p_teacher_id and academy_id = public.current_academy_id()) then
    raise exception 'No encontramos ese profe.' using errcode = 'P0002';
  end if;
  if not (public.has_permission('classes.manage') or public.is_my_teacher(p_teacher_id)) then
    raise exception 'No podés cambiar esta foto.' using errcode = '42501';
  end if;
  select photo_path into v_previous from public.teachers where id = p_teacher_id for update;
  update public.teachers set photo_path = p_path where id = p_teacher_id;  -- la columna valida la ruta
  return v_previous;
end;
$$;
revoke all on function public.set_teacher_photo(uuid, text) from public, anon;
grant execute on function public.set_teacher_photo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Foto del alumno
-- ---------------------------------------------------------------------

alter table public.students
  add column photo_path text
  constraint students_photo_path_ok check (
    photo_path ~ '^[0-9a-f-]{36}/alumnos/[0-9a-f-]{36}/[A-Za-z0-9_-]{8,40}\.(jpg|png|webp)$'
    and split_part(photo_path, '/', 1) = academy_id::text
    and split_part(photo_path, '/', 3) = id::text
  );

comment on column public.students.photo_path is
  'Foto de perfil (bucket privado "fotos"), para que recepción reconozca al alumno. Sólo uso interno.';

-- ¿Quien inició sesión puede subir o quitar la foto de este alumno?
create or replace function public.can_manage_student_photo(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and s.academy_id = public.current_academy_id()
      and (
        public.has_permission('people.manage')
        -- su madre, padre o tutor/a
        or exists (select 1 from public.guardian_students gs join public.guardians g on g.id = gs.guardian_id
                   where gs.student_id = s.id and g.profile_id = auth.uid())
        -- el propio alumno, si es mayor de edad (los menores, a través de su tutor/a)
        or (s.profile_id = auth.uid() and s.birth_date is not null and s.birth_date <= (current_date - interval '18 years')::date)
      )
  );
$$;
revoke all on function public.can_manage_student_photo(uuid) from public, anon;
grant execute on function public.can_manage_student_photo(uuid) to authenticated;

-- Bucket privado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Fotos de alumnos: subir" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and (storage.foldername(name))[2] = 'alumnos'
    and public.can_manage_student_photo(public.folder_uuid(name, 3))
  );

create policy "Fotos de alumnos: ver" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and (storage.foldername(name))[2] = 'alumnos'
    and (public.has_permission('people.view') or public.is_my_student(public.folder_uuid(name, 3)))
  );

create policy "Fotos de alumnos: borrar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and (storage.foldername(name))[2] = 'alumnos'
    and public.can_manage_student_photo(public.folder_uuid(name, 3))
  );

-- Guardar o quitar la foto (p_path null = quitar). Devuelve la anterior.
create or replace function public.set_student_photo(p_student_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
begin
  if not public.can_manage_student_photo(p_student_id) then
    raise exception 'No podés cambiar la foto de este alumno.' using errcode = '42501';
  end if;
  select photo_path into v_previous from public.students where id = p_student_id for update;
  update public.students set photo_path = p_path where id = p_student_id;  -- la columna valida la ruta
  return v_previous;
end;
$$;
revoke all on function public.set_student_photo(uuid, text) from public, anon;
grant execute on function public.set_student_photo(uuid, text) to authenticated;
