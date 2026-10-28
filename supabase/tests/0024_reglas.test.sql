-- Pruebas de la edición de reglas. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
-- Precio único (sin recargo por otros medios): estas pruebas son anteriores al precio en efectivo (0030).
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');

-- 1. Administración cambia varias reglas juntas; queda quién lo hizo.
do $$
begin
  assert update_settings('{"grace_days": 7, "checkin_before_minutes": 45, "cancel_hours": 12}') = 2, 'dos cambiaron';
  assert (select value from app_settings where key = 'grace_days') = 7, 'gracia 7';
  assert (select updated_by from app_settings where key = 'grace_days') = 'd0000000-0000-0000-0000-00000000000d', 'con autor';
  assert exists (select 1 from audit_logs where table_name = 'app_settings'), 'auditado';
  raise notice 'OK  cambiar reglas';
end $$;

-- 2. Rangos y coherencia: nada queda a medias.
do $$
begin
  begin
    perform update_settings('{"grace_days": 40}');
    raise exception 'fuera de rango';
  exception when invalid_parameter_value then
    if sqlerrm not like 'El valor de grace_days tiene que estar entre 0 y 15.' then raise; end if;
  end;
  begin
    perform update_settings('{"credit_days": 20}');
    raise exception 'crédito incoherente';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform update_settings('{"cualquiera": 1}');
    raise exception 'regla desconocida';
  exception when invalid_parameter_value then null;
  end;
  begin
    update app_settings set value = 500 where key = 'checkin_after_minutes';
    raise exception 'ni siquiera directo';
  exception when invalid_parameter_value then null;
  end;
  assert (select value from app_settings where key = 'credit_days') = 5, 'sin cambios';
  raise notice 'OK  rangos de las reglas';
end $$;

-- 3. Recepción no cambia reglas.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform update_settings('{"grace_days": 3}');
  raise exception 'recepción no cambia reglas';
exception when insufficient_privilege then
  raise notice 'OK  sólo administración';
end $$;

rollback;
