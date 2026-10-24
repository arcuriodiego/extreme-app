-- Pruebas de la migración base. Se corren dentro de una transacción que se deshace al final.
-- Cada bloque falla con un mensaje claro si la regla no se cumple.
\set ON_ERROR_STOP on
begin;

-- 1. Crear una academia carga automáticamente las reglas aprobadas.
do $$
declare v_id uuid;
begin
  insert into academies (slug, name) values ('test-academia', 'Academia de prueba') returning id into v_id;
  assert (select count(*) from app_settings where academy_id = v_id) = 12, 'deberían crearse 12 reglas';
  assert setting(v_id, 'checkin_before_minutes') = 30 and setting(v_id, 'checkin_after_minutes') = 15, 'ventana de ingreso';
  assert setting(v_id, 'grace_days') = 5, 'gracia = 5 días';
  assert setting(v_id, 'cancel_hours') = 12, 'cancelación = 12 h';
  assert setting(v_id, 'credit_days') = 5, 'crédito = 5 días';
  assert setting(v_id, 'credit_class_window_days') = 14, 'tope de la clase = 14 días';
  assert setting(v_id, 'booking_hold_minutes') = 15, 'reserva sin pagar = 15 min';
  assert setting(v_id, 'suspension_alert_days') = 30, 'alerta de suspensión = 30 días';
  raise notice 'OK  reglas por defecto';
end $$;

-- 2. No se aceptan claves de regla desconocidas ni valores negativos.
do $$
declare v_id uuid := (select id from academies where slug = 'test-academia');
begin
  begin
    insert into app_settings (academy_id, key, value) values (v_id, 'clave_inventada', 1);
    raise exception 'debió rechazar una clave desconocida';
  exception when check_violation then null;
  end;
  begin
    update app_settings set value = -1 where academy_id = v_id and key = 'grace_days';
    raise exception 'debió rechazar un valor negativo';
  exception when check_violation then null;
  end;
  raise notice 'OK  validación de reglas';
end $$;

-- 3. Una sala no puede tener capacidad cero ni nombre repetido en la misma sede.
do $$
declare v_ac uuid := (select id from academies where slug = 'test-academia'); v_br uuid;
begin
  insert into branches (academy_id, name) values (v_ac, 'Sede A') returning id into v_br;
  insert into rooms (academy_id, branch_id, name, capacity) values (v_ac, v_br, 'Sala 1', 20);
  begin
    insert into rooms (academy_id, branch_id, name, capacity) values (v_ac, v_br, 'Sala 1', 15);
    raise exception 'debió rechazar una sala repetida';
  exception when unique_violation then null;
  end;
  begin
    insert into rooms (academy_id, branch_id, name, capacity) values (v_ac, v_br, 'Sala 2', 0);
    raise exception 'debió rechazar capacidad 0';
  exception when check_violation then null;
  end;
  raise notice 'OK  salas';
end $$;

-- 4. Cada cambio queda auditado con el antes y el después.
do $$
declare v_ac uuid := (select id from academies where slug = 'test-academia'); v_before int;
begin
  v_before := (select count(*) from audit_logs where table_name = 'app_settings');
  update app_settings set value = 6 where academy_id = v_ac and key = 'grace_days';
  assert (select count(*) from audit_logs where table_name = 'app_settings') = v_before + 1, 'debió auditar el cambio';
  assert (
    select (before ->> 'value')::int = 5 and (after ->> 'value')::int = 6
    from audit_logs where table_name = 'app_settings' and action = 'update' order by id desc limit 1
  ), 'la auditoría debe guardar el valor anterior y el nuevo';
  raise notice 'OK  auditoría registra cambios';
end $$;

-- 5. La auditoría no se puede editar ni borrar.
do $$
begin
  begin
    delete from audit_logs;
    raise exception 'debió impedir borrar la auditoría';
  exception when raise_exception then
    if sqlerrm not like 'La auditoría%' then raise; end if;
  end;
  raise notice 'OK  auditoría inmutable';
end $$;

-- 6. Row Level Security activado en todas las tablas.
do $$
begin
  assert not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ), 'todas las tablas deben tener RLS activado';
  raise notice 'OK  RLS activado';
end $$;

rollback;
