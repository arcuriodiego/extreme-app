-- Pruebas de roles, permisos y seguridad por rol. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

-- Personas de Extreme Dance: Diego (será admin), Paula (será recepción), Vale (alumna).
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","last_name":"Arcurio","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","last_name":"Recepción","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com',  '{"first_name":"Valentina","last_name":"Rodríguez","academy":"extreme-dance"}');

-- Otra academia, para comprobar que no se mezclan.
insert into academies (slug, name) values ('otra-academia', 'Otra Academia');
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-00000000000c', 'otro@example.com', '{"first_name":"Otro","academy":"otra-academia"}');

-- 1. Cada academia tiene sus 5 roles; Administración tiene todos los permisos.
do $$
declare v_ed uuid := (select id from academies where slug = 'extreme-dance');
begin
  assert (select count(*) from roles where academy_id = v_ed) = 5, 'deben existir 5 roles';
  assert (select count(*) from role_permissions rp join roles r on r.id = rp.role_id
          where r.academy_id = v_ed and r.code = 'admin') = (select count(*) from permissions),
    'administración debe tener todos los permisos';
  assert not exists (select 1 from role_permissions rp join roles r on r.id = rp.role_id
                     where r.academy_id = v_ed and r.code = 'teacher' and rp.permission_code like 'finance.%'),
    'un profesor no debe ver finanzas';
  raise notice 'OK  roles y permisos iniciales';
end $$;

-- 2. Al registrarse, cada persona queda como Alumno y su perfil guarda el email.
do $$
begin
  assert (select r.code from user_roles ur join roles r on r.id = ur.role_id
          where ur.profile_id = 'b0000000-0000-0000-0000-00000000000b') = 'student', 'rol inicial Alumno';
  assert (select email from profiles where id = 'b0000000-0000-0000-0000-00000000000b') = 'vale@example.com', 'email copiado';
  update auth.users set email = 'vale.nuevo@example.com' where id = 'b0000000-0000-0000-0000-00000000000b';
  assert (select email from profiles where id = 'b0000000-0000-0000-0000-00000000000b') = 'vale.nuevo@example.com',
    'el email se mantiene sincronizado';
  raise notice 'OK  rol Alumno y email al registrarse';
end $$;

-- 3. Primer administrador: funciona una sola vez.
do $$
begin
  perform bootstrap_admin('DIEGO@example.com');
  assert exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.profile_id = 'd0000000-0000-0000-0000-00000000000d' and r.code = 'admin'), 'Diego es admin';
  begin
    perform bootstrap_admin('vale.nuevo@example.com');
    raise exception 'no debió permitir un segundo bootstrap';
  exception when raise_exception then
    if sqlerrm not like 'La academia ya tiene%' then raise; end if;
  end;
  raise notice 'OK  primer administrador, una sola vez';
end $$;

-- 4. Desde la app nadie puede ejecutar bootstrap_admin.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  begin
    perform bootstrap_admin('vale.nuevo@example.com');
    raise exception 'un usuario no debe poder usar bootstrap_admin';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  bootstrap sólo desde el editor SQL';
end $$;

-- 5. Una alumna no puede darse roles: ni con la función ni escribiendo la tabla.
do $$
begin
  assert has_permission('roles.manage') = false, 'la alumna no gestiona roles';
  begin
    perform grant_role('b0000000-0000-0000-0000-00000000000b', 'admin');
    raise exception 'la alumna no debe poder asignarse roles';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into user_roles (academy_id, profile_id, role_id)
    select academy_id, id, (select id from roles where code = 'admin' limit 1) from profiles where id = auth.uid();
    raise exception 'no debe poder escribir user_roles';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sin autoasignación de roles';
end $$;

-- 6. La alumna ve sólo su perfil, sólo sus roles, las reglas pero no la auditoría.
do $$
begin
  assert (select count(*) from profiles) = 1, 'sólo su perfil';
  assert (select count(*) from user_roles) = 1, 'sólo sus roles';
  assert (select count(*) from app_settings) = 8, 've las reglas de su academia';
  assert (select count(*) from audit_logs) = 0, 'no ve la auditoría';
  assert (select role_codes from my_access()) = '{student}', 'my_access devuelve su rol';
  raise notice 'OK  la alumna ve sólo lo suyo';
end $$;

-- 7. La alumna no puede cambiar las reglas (no hay error: simplemente no modifica nada).
do $$
declare v_rows int;
begin
  update app_settings set value = 99 where key = 'grace_days';
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'la alumna no cambia reglas';
  raise notice 'OK  la alumna no cambia reglas';
end $$;

-- 8. Diego (admin) asigna Recepción a Paula.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  perform grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
  perform grant_role('a0000000-0000-0000-0000-00000000000a', 'reception'); -- repetir no duplica
  assert (select count(*) from user_roles ur join roles r on r.id = ur.role_id
          where ur.profile_id = 'a0000000-0000-0000-0000-00000000000a' and r.code = 'reception') = 1,
    'Paula tiene Recepción una sola vez';
  raise notice 'OK  admin asigna roles';
end $$;

-- 9. Diego no ve personas de otra academia ni puede darles roles.
do $$
begin
  assert (select count(*) from profiles) = 3, 've sólo las 3 personas de Extreme Dance';
  begin
    perform grant_role('c0000000-0000-0000-0000-00000000000c', 'reception');
    raise exception 'no debe asignar roles a otra academia';
  exception when no_data_found then null;
  end;
  raise notice 'OK  academias aisladas';
end $$;

-- 10. No se puede quitar el último rol de Administración.
do $$
begin
  begin
    perform revoke_role('d0000000-0000-0000-0000-00000000000d', 'admin');
    raise exception 'debió impedir quedarse sin admin';
  exception when raise_exception then
    if sqlerrm not like 'Tiene que quedar%' then raise; end if;
  end;
  raise notice 'OK  siempre queda un admin';
end $$;

-- 11. Diego cambia una regla y la ve en la auditoría.
do $$
declare v_rows int;
begin
  update app_settings set value = 6 where key = 'grace_days';
  get diagnostics v_rows = row_count;
  assert v_rows = 1, 'admin cambia reglas';
  assert exists (select 1 from audit_logs where table_name = 'app_settings' and actor_id = auth.uid()), 'admin ve la auditoría';
  raise notice 'OK  admin cambia reglas y ve la auditoría';
end $$;

-- 12. Paula (recepción) ve a todas las personas pero no gestiona roles, reglas ni auditoría.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare v_rows int;
begin
  assert (select count(*) from profiles) = 3, 'recepción ve las personas de la academia';
  assert (select count(*) from audit_logs) = 0, 'recepción no ve la auditoría';
  update app_settings set value = 1 where key = 'grace_days';
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'recepción no cambia reglas';
  begin
    perform grant_role('a0000000-0000-0000-0000-00000000000a', 'admin');
    raise exception 'recepción no debe poder darse admin';
  exception when insufficient_privilege then null;
  end;
  update profiles set phone = '11 4444-5555' where id = 'b0000000-0000-0000-0000-00000000000b';
  get diagnostics v_rows = row_count;
  assert v_rows = 1, 'recepción puede actualizar datos de una alumna';
  raise notice 'OK  recepción: personas sí; roles, reglas y auditoría no';
end $$;

-- 13. Con dos admins, uno puede quitarle el rol al otro.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  perform grant_role('a0000000-0000-0000-0000-00000000000a', 'admin');
  perform revoke_role('a0000000-0000-0000-0000-00000000000a', 'admin');
  assert not exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                     where ur.profile_id = 'a0000000-0000-0000-0000-00000000000a' and r.code = 'admin'), 'admin quitado';
  raise notice 'OK  quitar roles';
end $$;

reset role;

-- 14. Todo cambio de rol queda auditado con su autor.
do $$
begin
  assert (select count(*) from audit_logs where table_name = 'user_roles'
          and actor_id = 'd0000000-0000-0000-0000-00000000000d') >= 3, 'cambios de rol auditados con autor';
  raise notice 'OK  cambios de rol auditados';
end $$;

rollback;
