-- Arreglo (24 oct): no se podía cerrar un grupo (ni quitar o cambiar un horario) si una clase
-- futura tenía una reserva YA CANCELADA. La reserva cancelada sigue guardada (es historial:
-- devolvió la clase al pack o generó un crédito) y la clave foránea impedía borrar la clase.
--
-- Ahora, cuando la grilla intenta borrar una clase futura:
-- - Si tiene reservas confirmadas: error claro (como antes). Primero se cancelan o se suspende la clase.
-- - Si sólo tiene historial (reservas canceladas o asistencias): no se borra; queda suspendida
--   con el motivo "Se quitó de la grilla", así se conserva el historial.
-- - Si no tiene nada: se borra como siempre.

create or replace function public.class_sessions_keep_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.bookings where session_id = old.id and status = 'confirmed') then
    raise exception 'Hay reservas confirmadas en una clase futura de este horario o grupo.'
      using errcode = 'P0001', hint = 'con-reservas';
  end if;
  if exists (select 1 from public.bookings where session_id = old.id)
     or exists (select 1 from public.attendances where session_id = old.id) then
    if old.status <> 'cancelled' then
      update public.class_sessions
         set status = 'cancelled', cancel_reason = 'Se quitó de la grilla', cancelled_at = now(),
             cancelled_by = public.current_actor_id()
       where id = old.id;
    end if;
    return null; -- no se borra: queda suspendida con su historial
  end if;
  return old;
end;
$$;

create trigger class_sessions_keep_history before delete on public.class_sessions
  for each row execute function public.class_sessions_keep_history();

revoke all on function public.class_sessions_keep_history() from public, anon, authenticated;

-- Un grupo con reservas o asistencias (aunque sean de clases futuras) tiene historial:
-- se cierra en vez de borrarse.
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
                       where s.group_id = p_group_id)
            or exists (select 1 from public.bookings b join public.class_sessions cs on cs.id = b.session_id
                       where cs.group_id = p_group_id)
            or exists (select 1 from public.attendances a join public.class_sessions cs on cs.id = a.session_id
                       where cs.group_id = p_group_id);

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
