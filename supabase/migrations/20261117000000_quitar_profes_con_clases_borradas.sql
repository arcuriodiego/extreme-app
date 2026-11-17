-- =====================================================================
-- Quitar un profe cuyas clases ya se eliminaron (Diego, 17 nov).
-- Al eliminar un grupo con fechas ya pasadas, el grupo queda "cerrado"
-- (no se borra) y eso impedía quitar al profe aunque nadie hubiera
-- reservado ni venido nunca. Ahora:
--   * Si el profe todavía tiene clases en la grilla (grupos abiertos), se
--     avisa que primero hay que eliminarlas.
--   * Sus grupos cerrados se borran junto con él, siempre que no tengan
--     historia real (alumnos fijos, reservas, ingresos, compras): esas
--     tablas tienen claves "restrict" y, si hay algo, no se borra nada.
--   * Los reemplazos futuros que tenía asignados se quitan.
--   * Cuotas de profe a su nombre siguen impidiendo quitarlo.
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

  if exists (select 1 from public.class_groups
             where academy_id = v_academy and teacher_id = p_teacher_id and status <> 'closed') then
    raise exception 'Ese profe todavía tiene clases en la grilla: primero eliminalas desde su página.'
      using errcode = '23503', hint = 'teacher_has_classes';
  end if;

  begin
    -- Reemplazos que todavía no pasaron.
    update public.class_sessions set substitute_teacher_id = null
    where academy_id = v_academy and substitute_teacher_id = p_teacher_id and starts_at > now();

    -- Grupos cerrados: fechas, horarios y el grupo. Si alguna fecha tiene
    -- reservas, ingresos o compras, o algún horario tuvo alumnos fijos, las
    -- claves "restrict" lo frenan y se deshace todo este bloque.
    delete from public.class_sessions
    where academy_id = v_academy
      and group_id in (select id from public.class_groups where academy_id = v_academy and teacher_id = p_teacher_id);
    delete from public.class_schedules
    where academy_id = v_academy
      and group_id in (select id from public.class_groups where academy_id = v_academy and teacher_id = p_teacher_id);
    delete from public.class_groups where academy_id = v_academy and teacher_id = p_teacher_id;

    delete from public.user_roles ur
    using public.roles r
    where r.id = ur.role_id and r.code = 'teacher' and ur.profile_id = v_profile and ur.academy_id = v_academy;
    delete from public.teachers where id = p_teacher_id;
  exception when foreign_key_violation then
    raise exception 'Ese profe ya tiene historial (alumnos, reservas, ingresos o cuotas): no se puede quitar. Sacale el rol Profesor y queda como "sin rol".'
      using errcode = '23503', hint = 'teacher_in_use';
  end;

  return v_photo;
end;
$$;

revoke all on function public.delete_teacher(uuid) from public, anon;
grant execute on function public.delete_teacher(uuid) to authenticated;
