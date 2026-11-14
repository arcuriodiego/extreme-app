-- Salas (Diego, 14 nov): administración puede editarlas (nombre y capacidad, ya permitido)
-- y borrar las que nunca se usaron. Si una sala tiene horarios, clases o workshops
-- (aunque sean pasados), la base no deja borrarla (claves foráneas "restrict"): se desactiva.

grant delete on public.rooms to authenticated;

create policy "Administración borra salas" on public.rooms
  for delete to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('classes.manage'));
