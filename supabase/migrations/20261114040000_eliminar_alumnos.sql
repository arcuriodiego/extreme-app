-- =====================================================================
-- Eliminar alumnos (Diego, 14 nov): para fichas o cuentas creadas por error.
--
-- Sólo administración (settings.manage). Sólo si la ficha no tiene historial:
-- cuotas, cargos, pagos, devoluciones, reservas, packs, workshops, ingresos ni
-- asistencias (las claves foráneas "restrict" lo frenan). Con historial, se pasa
-- a Inactivo.
--
-- Si la ficha tiene cuenta en la app y esa cuenta no es del personal, ni tutor
-- de otros alumnos, ni autora de avisos o inscripciones de otros, también se
-- borra la cuenta (para que pueda volver a registrarse con el mismo email).
-- Si la cuenta no se puede borrar, se le quita el rol Alumno y queda sin ficha.
-- =====================================================================

create or replace function public.delete_student(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_profile uuid;
  v_name text;
  v_account_deleted boolean := false;
begin
  if v_academy is null or not public.has_permission('settings.manage') then
    raise exception 'Sólo administración puede eliminar alumnos.' using errcode = '42501';
  end if;

  select profile_id, trim(first_name || ' ' || last_name) into v_profile, v_name
  from public.students
  where id = p_student_id and academy_id = v_academy
  for update;
  if not found then
    raise exception 'No encontramos esa ficha.' using errcode = 'P0002';
  end if;
  if v_profile is not null and v_profile = auth.uid() then
    raise exception 'No podés eliminar tu propia ficha.' using errcode = '22023', hint = 'own_student';
  end if;

  begin
    delete from public.students where id = p_student_id;
  exception when foreign_key_violation then
    raise exception 'La ficha tiene historial (cuotas, pagos, reservas o ingresos). Pasala a Inactivo.'
      using errcode = '23503', hint = 'has_history';
  end;

  if v_profile is not null then
    -- ¿La cuenta es sólo de alumno (o tutor sin otros chicos a cargo)?
    if not exists (
         select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
         where ur.profile_id = v_profile and r.code not in ('student', 'guardian'))
       and not exists (select 1 from public.teachers where profile_id = v_profile)
       and not exists (select 1 from public.students where profile_id = v_profile)
       and not exists (
         select 1 from public.guardian_students gs join public.guardians g on g.id = gs.guardian_id
         where g.profile_id = v_profile)
    then
      begin
        delete from public.guardians where profile_id = v_profile;
        delete from auth.users where id = v_profile;
        v_account_deleted := true;
      exception when foreign_key_violation or insufficient_privilege then
        v_account_deleted := false;
      end;
    end if;

    if not v_account_deleted then
      delete from public.user_roles ur
      using public.roles r
      where r.id = ur.role_id and ur.profile_id = v_profile and r.code = 'student'
        and not exists (select 1 from public.students where profile_id = v_profile);
    end if;
  end if;

  return jsonb_build_object('name', v_name, 'account_deleted', v_account_deleted);
end;
$$;

revoke all on function public.delete_student(uuid) from public, anon;
grant execute on function public.delete_student(uuid) to authenticated;
