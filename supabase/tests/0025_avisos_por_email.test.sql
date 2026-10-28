-- Pruebas del despacho de avisos por email. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('b1000000-0000-0000-0000-00000000000b', 'sofi@example.com', '{"first_name":"Sofía","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
-- Precio único (sin recargo por otros medios): estas pruebas son anteriores al precio en efectivo (0030).
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');

-- Recepción manda un aviso a todos: queda pendiente de email para cada uno.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select send_announcement(null, 'Feriado', 'No hay clases.');

-- 1. Una alumna sólo despacha los suyos.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare n integer;
begin
  select count(*) into n from claim_notification_emails(50);
  assert n = 1, format('sólo el suyo: %s', n);
  raise notice 'OK  la alumna despacha sólo lo suyo';
end $$;

-- 2. Recepción despacha el resto; marcar enviados y fallidos; no se toman dos veces.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare v_ids uuid[]; v_mail text;
begin
  select array_agg(id), min(email) into v_ids, v_mail from claim_notification_emails(50);
  assert array_length(v_ids, 1) >= 1, 'hay pendientes';
  assert (select count(*) from claim_notification_emails(50)) = 0, 'no se toman dos veces';
  perform finish_notification_emails(v_ids[1:1], v_ids[2:]);
  raise notice 'OK  recepción despacha y marca';
end $$;
reset role;
do $$
begin
  assert (select count(*) from notifications where email_status = 'sent') = 1, 'uno enviado';
  assert not exists (select 1 from notifications where email_status = 'pending'), 'nada pendiente';
  raise notice 'OK  estados de email';
end $$;

rollback;
