-- =====================================================================
-- Quitar profes (Diego, 17 nov, segunda parte).
-- Si a una clase se le cambió el profe, las fechas ya pasadas quedan a
-- nombre del profe anterior y eso impedía quitarlo aunque nadie hubiera
-- venido. Ahora, las fechas pasadas sin reservas, ingresos ni compras
-- pasan al profe actual de la clase (y los reemplazos vacíos se quitan).
-- Si igual queda algo real, el aviso dice qué es.
-- =====================================================================

-- Una fecha "sin nadie": sin reservas, ingresos ni compras.
create or replace function public.session_is_empty(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.bookings b where b.session_id = p_session_id)
     and not exists (select 1 from public.attendances a where a.session_id = p_session_id)
     and not exists (select 1 from public.purchases pu where pu.session_id = p_session_id);
$$;
revoke all on function public.session_is_empty(uuid) from public, anon, authenticated;

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
  v_cuotas int;
  v_fechas int;
  v_fijos int;
  v_reasons text[] := '{}';
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
    -- Reemplazos futuros o en fechas sin nadie (sin reservas, ingresos ni compras): se quitan.
    update public.class_sessions cs set substitute_teacher_id = null
    where cs.academy_id = v_academy and cs.substitute_teacher_id = p_teacher_id
      and (cs.starts_at > now() or public.session_is_empty(cs.id));

    -- Fechas sin nadie de clases que hoy son de otro profe: pasan a ese profe.
    update public.class_sessions cs set teacher_id = g.teacher_id
    from public.class_groups g
    where g.id = cs.group_id and cs.academy_id = v_academy
      and cs.teacher_id = p_teacher_id and g.teacher_id is distinct from p_teacher_id
      and public.session_is_empty(cs.id);

    -- Sus grupos cerrados: fechas, horarios y el grupo.
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
    -- Se deshizo todo el bloque. Contamos qué la frena para decirlo.
    select count(*) into v_cuotas from public.memberships where academy_id = v_academy and teacher_id = p_teacher_id;
    select count(*) into v_fechas from public.class_sessions cs
    where cs.academy_id = v_academy and (cs.teacher_id = p_teacher_id or cs.substitute_teacher_id = p_teacher_id)
      and not public.session_is_empty(cs.id);
    select count(*) into v_fijos from public.enrollments e
    join public.class_schedules s on s.id = e.schedule_id
    join public.class_groups g on g.id = s.group_id
    where g.academy_id = v_academy and g.teacher_id = p_teacher_id;
    if v_cuotas > 0 then v_reasons := v_reasons || (v_cuotas || ' cuota(s) de profe a su nombre'); end if;
    if v_fechas > 0 then v_reasons := v_reasons || (v_fechas || ' clase(s) con reservas, ingresos o compras'); end if;
    if v_fijos > 0 then v_reasons := v_reasons || (v_fijos || ' alumno(s) fijo(s) en sus clases'); end if;
    raise exception 'No se puede quitar: tiene historial (%).',
      coalesce(nullif(array_to_string(v_reasons, ', '), ''), 'otros registros')
      using errcode = '23503', hint = 'teacher_in_use';
  end;

  return v_photo;
end;
$$;

revoke all on function public.delete_teacher(uuid) from public, anon;
grant execute on function public.delete_teacher(uuid) to authenticated;
