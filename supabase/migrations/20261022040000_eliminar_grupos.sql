-- =====================================================================
-- Migración 0009 · Eliminar grupos
-- Pedido de Diego (22 oct): poder eliminar grupos para que la lista quede limpia.
-- - Sin historial (nunca tuvo clases dadas ni alumnos fijos): se borra del todo.
-- - Con historial: se cierra y se oculta de la lista; las clases pasadas,
--   asistencias y cuotas viejas siguen apuntando a él.
-- - Con alumnos fijos activos: no se puede (primero cambiarles el horario o darles de baja).
-- =====================================================================

-- Corrección de la migración 0006: como disparador BEFORE DELETE, la función
-- devolvía NULL, y eso cancela el borrado del horario sin dar error.
-- Ahora devuelve la fila, así el borrado sigue su curso.
create or replace function public.schedules_sync_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.class_sessions where schedule_id = old.id and starts_at > now();
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.generate_sessions(new.academy_id, new.id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.delete_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_history boolean;
begin
  if v_academy is null or not public.has_permission('classes.manage') then
    raise exception 'No tenés permiso para cambiar la grilla.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.class_groups where id = p_group_id and academy_id = v_academy) then
    raise exception 'Ese grupo ya no existe.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.enrollments e join public.class_schedules s on s.id = e.schedule_id
             where s.group_id = p_group_id and e.status = 'active') then
    raise exception 'Ese grupo tiene alumnos fijos: primero cambiales el horario o dales de baja.' using errcode = 'P0001';
  end if;

  v_history := exists (select 1 from public.class_sessions where group_id = p_group_id and starts_at <= now())
            or exists (select 1 from public.enrollments e join public.class_schedules s on s.id = e.schedule_id
                       where s.group_id = p_group_id);

  if v_history then
    update public.class_groups set status = 'closed' where id = p_group_id and status <> 'closed';
    return 'archived';
  end if;

  delete from public.class_sessions where group_id = p_group_id;
  delete from public.class_schedules where group_id = p_group_id;
  delete from public.class_groups where id = p_group_id;
  return 'deleted';
end;
$$;

revoke all on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;
