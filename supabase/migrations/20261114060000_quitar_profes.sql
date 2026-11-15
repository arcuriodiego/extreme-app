-- =====================================================================
-- Quitar un profe de la lista (Diego, 14 nov): para profes que quedaron por
-- error (por ejemplo, alguien con dos cuentas). Sólo administración y sólo si
-- nunca tuvo grupos, clases, reemplazos ni cuotas: con historial no se puede
-- (claves foráneas "restrict"), para no perder reportes ni liquidaciones.
-- También le quita el rol Profesor a esa cuenta (la cuenta no se borra).
-- Devuelve la ruta de la foto, para borrar el archivo.
-- =====================================================================

create or replace function public.delete_teacher(p_teacher_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_profile uuid;
  v_photo text;
begin
  if v_academy is null or not (public.has_permission('classes.manage') and public.has_permission('roles.manage')) then
    raise exception 'Sólo administración puede quitar profes.' using errcode = '42501';
  end if;

  select profile_id, photo_path into v_profile, v_photo
  from public.teachers where id = p_teacher_id and academy_id = v_academy
  for update;
  if not found then
    raise exception 'No encontramos ese profe.' using errcode = 'P0002';
  end if;

  begin
    delete from public.user_roles ur
    using public.roles r
    where r.id = ur.role_id and r.code = 'teacher' and ur.profile_id = v_profile and ur.academy_id = v_academy;
    delete from public.teachers where id = p_teacher_id;
  exception when foreign_key_violation then
    raise exception 'Ese profe ya tiene grupos, clases o cuotas: no se puede quitar. Sacale el rol Profesor y queda como "sin rol".'
      using errcode = '23503', hint = 'teacher_in_use';
  end;

  return v_photo;
end;
$$;

revoke all on function public.delete_teacher(uuid) from public, anon;
grant execute on function public.delete_teacher(uuid) to authenticated;
