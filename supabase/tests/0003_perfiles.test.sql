-- Pruebas de perfiles y de su seguridad. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

-- Dos usuarios registrados, como lo haría Supabase Auth.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'valentina@example.com',
   '{"first_name": "  Valentina ", "last_name": "Rodríguez", "academy": "extreme-dance"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'tomas@example.com',
   '{"first_name": "Tomás"}');

-- 1. El perfil se crea solo, con nombre limpio y asociado a Extreme Dance.
do $$
begin
  assert (select count(*) from profiles) = 2, 'deben existir 2 perfiles';
  assert (select first_name from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Valentina',
    'el nombre debe guardarse sin espacios sobrantes';
  assert (select a.slug from profiles p join academies a on a.id = p.academy_id
          where p.id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'extreme-dance', 'academia correcta';
  assert (select academy_id from profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') is not null,
    'sin academia en el registro, usa la primera';
  raise notice 'OK  perfil automático al registrarse';
end $$;

-- A partir de acá actuamos como Valentina, con los permisos de un usuario común.
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

-- 2. Sólo ve su propio perfil.
do $$
begin
  assert (select count(*) from profiles) = 1, 'debe ver sólo su perfil';
  assert (select first_name from profiles) = 'Valentina', 'el perfil visible es el suyo';
  raise notice 'OK  cada usuario ve sólo su perfil';
end $$;

-- 3. Puede editar sus datos personales.
do $$
begin
  update profiles set phone = '11 5555-4210', birth_date = '1998-03-14'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert (select phone from profiles) = '11 5555-4210', 'debió guardar el teléfono';
  raise notice 'OK  edita sus datos';
end $$;

-- 4. No puede tocar el perfil de otro: la modificación no afecta ninguna fila.
do $$
declare v_rows int;
begin
  update profiles set first_name = 'Hackeado' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'no debe poder editar otro perfil';
  raise notice 'OK  no edita perfiles ajenos';
end $$;

-- 5. No puede cambiar su academia.
do $$
begin
  begin
    update profiles set academy_id = gen_random_uuid() where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'debió rechazar el cambio de academia';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  no cambia su academia';
end $$;

-- 6. No puede crear ni borrar perfiles a mano.
do $$
begin
  begin
    insert into profiles (id, academy_id) values (gen_random_uuid(), gen_random_uuid());
    raise exception 'debió rechazar la creación manual';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from profiles;
    raise exception 'debió rechazar el borrado';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  no crea ni borra perfiles';
end $$;

reset role;

-- 7. Un visitante sin sesión no ve ningún perfil.
set local role anon;
do $$
begin
  begin
    perform 1 from profiles;
    raise exception 'un visitante no debe poder leer perfiles';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  visitantes sin acceso';
end $$;
reset role;

-- 8. El cambio de Valentina quedó en la auditoría, con ella como responsable.
do $$
begin
  assert exists (
    select 1 from audit_logs
    where table_name = 'profiles' and action = 'update'
      and actor_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and after ->> 'phone' = '11 5555-4210'
  ), 'la edición debe quedar auditada con su autor';
  raise notice 'OK  edición auditada';
end $$;

rollback;
