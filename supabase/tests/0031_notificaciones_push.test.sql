-- Pruebas de notificaciones al celular. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'laura@example.com', '{"first_name":"Laura","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');

-- 1. Valentina activa las notificaciones en su iPhone; Laura no.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select save_push_subscription('https://web.push.apple.com/abc123', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'iPhone');
select save_push_subscription('https://web.push.apple.com/abc123', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'iPhone');
do $$
begin
  assert (select count(*) from push_subscriptions) = 1, 'una suscripción';
  raise notice 'OK  guardar suscripción';
end $$;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert (select count(*) from push_subscriptions) = 0, 'Laura no ve la de Valentina';
  raise notice 'OK  suscripciones privadas';
end $$;

-- 2. Recepción manda un aviso a todas: a Valentina se le manda al celular; a Laura no (no tiene).
reset role;
insert into notifications (academy_id, recipient_id, kind, title, body, link, dedupe_key)
select p.academy_id, p.id, 'announcement', 'Feriado el lunes', 'No hay clases.', '/avisos', 'prueba'
from profiles p where p.email in ('vale@example.com', 'laura@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare r record; n integer := 0;
begin
  for r in select * from claim_notification_pushes(50) loop
    n := n + 1;
    assert r.endpoint = 'https://web.push.apple.com/abc123', 'endpoint';
    assert r.title = 'Feriado el lunes', 'título';
    perform finish_notification_pushes(array[r.notification_id], '{}', '{}');
  end loop;
  assert n = 1, format('un envío: %s', n);
  raise notice 'OK  recepción despacha';
end $$;
reset role;
do $$
begin
  assert (select push_status from notifications n join profiles p on p.id = n.recipient_id where p.email = 'vale@example.com') = 'sent', 'enviada';
  assert (select push_status from notifications n join profiles p on p.id = n.recipient_id where p.email = 'laura@example.com') = 'skipped', 'sin suscripción';
  assert (select last_used_at from push_subscriptions) is not null, 'usada';
  raise notice 'OK  estados';
end $$;

-- 3. Una alumna sólo despacha lo suyo; una suscripción vencida se borra.
insert into notifications (academy_id, recipient_id, kind, title, dedupe_key)
select p.academy_id, p.id, 'announcement', 'Otro aviso', 'prueba2' from profiles p where p.email = 'vale@example.com';
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert not exists (select 1 from claim_notification_pushes(50)), 'Laura no despacha los de Valentina';
  raise notice 'OK  alcance';
end $$;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare r record;
begin
  select * into r from claim_notification_pushes(50);
  perform finish_notification_pushes('{}', array[r.notification_id], array[r.endpoint]);
  assert not exists (select 1 from push_subscriptions), 'vencida borrada';
  raise notice 'OK  suscripción vencida';
end $$;

-- 4. Desactivar.
select save_push_subscription('https://fcm.googleapis.com/fcm/send/xyz', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'Android');
select delete_push_subscription('https://fcm.googleapis.com/fcm/send/xyz');
do $$
begin
  assert not exists (select 1 from push_subscriptions), 'desactivada';
  raise notice 'OK  desactivar';
end $$;

rollback;
