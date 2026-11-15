-- Pruebas de compras desde la app (Mercado Pago). Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'otra@example.com', '{"first_name":"Otra","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
update app_settings set value = 85 where key = 'non_cash_surcharge_tenths';

-- Una clase futura que acepta reservas sueltas, con 1 lugar.
insert into rooms (academy_id, branch_id, name, capacity)
select academy_id, id, 'Sala Test', 30 from branches limit 1;
insert into class_groups (academy_id, style_id, age_category_id, capacity, allows_single_booking)
select a.id, (select id from dance_styles limit 1), (select id from age_categories limit 1), 1, true from academies a where slug = 'extreme-dance';
insert into class_sessions (academy_id, group_id, room_id, starts_at, ends_at, capacity, status)
select g.academy_id, g.id, (select id from rooms where name = 'Sala Test'), now() + interval '2 days', now() + interval '2 days 1 hour', 1, 'scheduled'
from class_groups g order by g.created_at desc limit 1;

create temp table ids as
select (select id from students where first_name = 'Valentina') as vale,
       (select id from students where first_name = 'Otra') as otra,
       (select id from plans where name = 'Pack 10 clases') as pack10,
       (select id from class_sessions order by created_at desc limit 1) as sesion;
grant select on ids to authenticated, service_role;

-- 1. La alumna crea la compra de un pack: el precio lo pone la base (otros medios).
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare r jsonb;
begin
  r := create_purchase('pack', (select vale from ids), (select pack10 from ids));
  assert (r->>'amount_cents')::bigint > 0 and (r->>'amount_cents')::bigint >= (select amount_cents from plan_prices where plan_id = (select pack10 from ids) order by valid_from desc limit 1), r::text;
  assert (select status from purchases where id = (r->>'id')::uuid) = 'pending', 'pendiente';
  raise notice 'OK  compra de pack pendiente';
end $$;

-- 2. No puede comprar para otro alumno.
do $$
begin
  perform create_purchase('pack', (select otra from ids), (select pack10 from ids));
  raise exception 'compró para otro';
exception when insufficient_privilege then
  raise notice 'OK  sólo para sí o sus hijos';
end $$;

-- 3. Un alumno no puede cumplir su compra (sólo el servidor).
do $$
begin
  perform fulfill_purchase((select id from purchases limit 1), '123', 1);
  raise exception 'el alumno confirmó un pago';
exception when insufficient_privilege then
  raise notice 'OK  sólo el servidor confirma';
end $$;

-- 4. El servidor confirma: pack cargado, cobro con Mercado Pago; repetir no duplica.
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare p uuid := (select id from purchases where kind = 'pack'); a bigint := (select amount_cents from purchases where kind = 'pack');
begin
  assert fulfill_purchase(p, 'MP-1', a) = 'approved', 'aprobada';
  assert fulfill_purchase(p, 'MP-1', a) = 'approved', 'idempotente';
end $$;
reset role;
do $$
begin
  assert (select count(*) from class_balances where student_id = (select vale from ids) and kind = 'pack') = 1, 'un pack';
  assert (select count(*) from payments where method = 'mp_checkout' and reference = 'MP MP-1') = 1, 'un cobro MP';
  raise notice 'OK  pack cargado al confirmarse';
end $$;

-- 5. Clase suelta: si se llenó antes de confirmar, el cobro queda y la compra pasa a revisar.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select create_purchase('single_class', (select vale from ids), (select sesion from ids));
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
select create_purchase('single_class', (select otra from ids), (select sesion from ids));
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare p1 uuid; p2 uuid; a bigint;
begin
  select id, amount_cents into p1, a from purchases where kind = 'single_class' and student_id = (select vale from ids);
  select id into p2 from purchases where kind = 'single_class' and student_id = (select otra from ids);
  perform fulfill_purchase(p1, 'MP-2', a);
  assert (select status from purchases where id = p1) = 'approved', (select note from purchases where id = p1);
  assert fulfill_purchase(p2, 'MP-3', a) = 'review', 'la segunda queda a revisar';
end $$;
reset role;
do $$
begin
  assert exists (select 1 from bookings where student_id = (select vale from ids) and status = 'confirmed'), 'reservada';
  assert exists (select 1 from payments where reference = 'MP MP-3'), 'el cobro de la segunda quedó registrado';
  assert (select note from purchases where mp_payment_id = 'MP-3') ilike '%completa%', 'motivo';
  raise notice 'OK  clase suelta y compra a revisar';
end $$;

-- 6. Monto distinto: a revisar, sin cumplir.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select create_purchase('pack', (select vale from ids), (select pack10 from ids));
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare p uuid := (select id from purchases where kind = 'pack' and status = 'pending');
begin
  assert fulfill_purchase(p, 'MP-4', 1) = 'review', 'monto distinto';
end $$;
reset role;
do $$
begin
  assert (select count(*) from class_balances where student_id = (select vale from ids) and kind = 'pack') = 1, 'no cargó otro pack';
  raise notice 'OK  monto distinto no se cumple';
end $$;

-- 7. Recepción no puede usar mp_checkout a mano.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  perform sell_pack((select vale from ids), (select pack10 from ids), 'mp_checkout', null);
  raise exception 'aceptó mp_checkout a mano';
exception when invalid_parameter_value then
  raise notice 'OK  mp_checkout sólo del servidor';
end $$;

rollback;
