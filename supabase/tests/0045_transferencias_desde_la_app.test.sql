-- Pruebas de "Ya transferí": el alumno adjunta el comprobante y recepción confirma o rechaza. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'otra@example.com', '{"first_name":"Otra","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
reset role;

create temp table ids as
select (select id from academies where slug = 'extreme-dance') as academy,
       (select id from students where first_name = 'Valentina') as vale,
       (select id from plans where name = 'Pack 10 clases') as pack10;
grant select on ids to authenticated;

-- 1. La alumna pide un pack por transferencia y adjunta el comprobante.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare r jsonb; p uuid; path text;
begin
  r := create_purchase('pack', (select vale from ids), (select pack10 from ids), 'transfer');
  p := (r->>'id')::uuid;
  path := (select academy::text from ids) || '/' || p::text || '/comprob001.jpg';
  insert into storage.objects (bucket_id, name) values ('comprobantes', path);
  perform set_transfer_proof(p, path);
  assert (select channel from purchases where id = p) = 'transfer', 'por transferencia';
  assert (select proof_path from purchases where id = p) = path, 'con comprobante';
  raise notice 'OK  pedido con comprobante';
end $$;

-- 2. Otra alumna no ve ni adjunta en compras ajenas; la alumna no puede confirmarse sola.
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'comprobantes') = 0, 'no ve comprobantes ajenos';
  assert (select count(*) from purchases) = 0, 'no ve compras ajenas';
  raise notice 'OK  privado';
end $$;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  perform confirm_transfer_purchase((select id from purchases limit 1));
  raise exception 'se confirmó sola';
exception when insufficient_privilege then
  raise notice 'OK  sólo recepción confirma';
end $$;

-- 3. Recepción ve el comprobante y confirma: pack cargado, cobro por transferencia.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare p uuid := (select id from purchases limit 1);
begin
  assert (select count(*) from storage.objects where bucket_id = 'comprobantes') = 1, 'recepción ve el comprobante';
  assert confirm_transfer_purchase(p) = 'approved', 'confirmada';
  assert confirm_transfer_purchase(p) = 'approved', 'confirmar dos veces no duplica';
  assert (select count(*) from class_balances where student_id = (select vale from ids)) = 1, 'un pack';
  assert (select count(*) from payments where method = 'transfer' and reference = 'Transferencia (desde la app)') = 1, 'un cobro';
  raise notice 'OK  recepción confirma';
end $$;

-- 4. Rechazo con motivo.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select create_purchase('pack', (select vale from ids), (select pack10 from ids), 'transfer');
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare p uuid := (select id from purchases where status = 'pending');
begin
  perform reject_transfer_purchase(p, 'No vimos la transferencia');
  assert (select status from purchases where id = p) = 'rejected', 'rechazada';
  assert (select count(*) from class_balances where student_id = (select vale from ids)) = 1, 'no cargó pack';
  begin
    perform confirm_transfer_purchase(p);
    raise exception 'confirmó una rechazada';
  exception when raise_exception then null;
  end;
  raise notice 'OK  rechazo';
end $$;

-- 5. Mercado Pago no puede cumplir una compra por transferencia.
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
begin
  perform fulfill_purchase((select id from purchases where status = 'rejected'), '1', 1);
  raise exception 'MP cumplió una transferencia';
exception when invalid_parameter_value then
  raise notice 'OK  canales separados';
end $$;

rollback;
