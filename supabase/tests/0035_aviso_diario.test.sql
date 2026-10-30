-- Pruebas del aviso diario automático (tarea programada con la clave de servicio). Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
delete from notification_runs;

-- 1. Un usuario común (ni siquiera administración) no puede correr la tarea de todas las academias.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
begin
  begin
    perform cron_daily_notifications();
    assert false, 'no debería poder';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sólo la tarea programada';
end $$;

-- 2. La tarea programada genera una vez por día y por academia.
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select cron_daily_notifications();
create temp table segunda as select cron_daily_notifications() as n;
reset role;
do $$
begin
  assert (select count(*) from notification_runs) = (select count(*) from academies), 'registró la corrida';
  assert (select n from segunda) = 0, 'la segunda vez no genera nada';
  raise notice 'OK  una vez por día';
end $$;

-- 3. Despacha los avisos de todos (email y celular) y marca el resultado.
reset role;
insert into notifications (academy_id, recipient_id, kind, title, body, link, dedupe_key)
select p.academy_id, p.id, 'announcement', 'Feriado', 'No hay clases.', '/avisos', 'prueba-diaria'
from profiles p where p.email = 'vale@example.com';
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
create temp table tomados as select id from claim_notification_emails(50);
select finish_notification_emails((select array_agg(id) from tomados), '{}');
select count(*) from claim_notification_pushes(50);
reset role;
do $$
begin
  assert (select count(*) from tomados) = 1, format('toma el aviso de Valentina: %s', (select count(*) from tomados));
  assert (select email_status from notifications where id = (select id from tomados)) = 'sent', 'enviado';
  assert (select push_status from notifications where id = (select id from tomados)) = 'skipped', 'sin celular suscripto';
  raise notice 'OK  despacho de servicio';
end $$;

-- 4. Un alumno sigue viendo y despachando sólo lo suyo.
reset role;
insert into notifications (academy_id, recipient_id, kind, title, body, link, dedupe_key)
select p.academy_id, p.id, 'announcement', 'Para Diego', 'Hola.', '/avisos', 'prueba-diego'
from profiles p where p.email = 'diego@example.com';
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  assert (select count(*) from claim_notification_emails(50)) = 0, 'Valentina no despacha avisos ajenos';
  raise notice 'OK  alcance de cada usuario';
end $$;

rollback;
