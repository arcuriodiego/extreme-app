-- Decisión de Diego (24 oct): el ingreso y el presente los registra sólo recepción
-- ("así tenemos el control nosotros"). El profe ve la lista de su clase con los presentes,
-- pero no escanea pases ni marca presentes a mano.
--
-- Se quita el permiso attendance.mark al rol Profesor: check_in y mark_attendance lo exigen.

delete from public.role_permissions rp
 using public.roles r
 where rp.role_id = r.id and r.code = 'teacher' and rp.permission_code = 'attendance.mark';

update public.roles set description = 'Sus clases y sus listas' where code = 'teacher';

create or replace function public.seed_default_roles(p_academy_id uuid)
returns void
language plpgsql
as $$
declare
  v_role uuid;
begin
  insert into public.roles (academy_id, code, name, description, is_system) values
    (p_academy_id, 'admin',     'Administración', 'Acceso completo a la gestión de la academia', true),
    (p_academy_id, 'reception', 'Recepción',      'Alumnos, cobros, asistencia y operación diaria', true),
    (p_academy_id, 'teacher',   'Profesor',       'Sus clases y sus listas', true),
    (p_academy_id, 'student',   'Alumno',         'Clases, reservas, pagos y pases propios', true),
    (p_academy_id, 'guardian',  'Tutor',          'Administra a alumnos menores vinculados', true)
  on conflict (academy_id, code) do nothing;

  select id into v_role from public.roles where academy_id = p_academy_id and code = 'admin';
  insert into public.role_permissions (role_id, permission_code)
    select v_role, code from public.permissions
  on conflict do nothing;

  select id into v_role from public.roles where academy_id = p_academy_id and code = 'reception';
  insert into public.role_permissions (role_id, permission_code) values
    (v_role, 'people.view'), (v_role, 'people.manage'), (v_role, 'payments.register'),
    (v_role, 'attendance.mark'), (v_role, 'classes.view_roster')
  on conflict do nothing;

  select id into v_role from public.roles where academy_id = p_academy_id and code = 'teacher';
  insert into public.role_permissions (role_id, permission_code) values
    (v_role, 'classes.view_roster')
  on conflict do nothing;
end;
$$;
