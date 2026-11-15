-- Pruebas: anular un pago deshace lo comprado; devolución de Mercado Pago. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');

insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala Test', 30 from branches limit 1;
insert into class_groups (academy_id, style_id, age_category_id, capacity, allows_single_booking)
select a.id, (select id from dance_styles limit 1), (select id from age_categories limit 1), 10, true from academies a where slug = 'extreme-dance';
insert into class_sessions (academy_id, group_id, room_id, starts_at, ends_at, capacity, status)
select g.academy_id, g.id, (select id from rooms where name = 'Sala Test'), now() + interval '2 days' + (n || ' hours')::interval, now() + interval '2 days 1 hour' + (n || ' hours')::interval, 10, 'scheduled'
from class_groups g, generate_series(0, 1) n;

create temp table ids as
select (select id from students where first_name = 'Valentina') as vale,
       (select academy_id from students where first_name = 'Valentina') as academy,
       (select id from plans where name = 'Pack 10 clases') as pack10,
       (select id from class_sessions order by starts_at limit 1) as s1,
       (select id from class_sessions order by starts_at desc limit 1) as s2;
grant select on ids to authenticated, service_role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';

-- 1. Pack: compra, reserva una clase futura; al anular el pago se cancela la reserva y se quitan las clases.
do $$
declare bal uuid; pay uuid;
begin
  bal := sell_pack((select vale from ids), (select pack10 from ids), 'cash', null);
  perform book_session((select s1 from ids), (select vale from ids));
  assert balance_remaining(bal) = 9, 'usó 1';
  select p.id into pay from payments p join payment_allocations a on a.payment_id = p.id join class_balances b on b.charge_id = a.charge_id where b.id = bal;
  perform void_payment(pay, 'Se arrepintió');
  assert balance_remaining(bal) = 0, format('sin clases: %s', balance_remaining(bal));
  assert not exists (select 1 from bookings where balance_id = bal and status = 'confirmed'), 'reserva cancelada';
  raise notice 'OK  pack anulado';
end $$;

-- 2. Clase suelta: al anular, se cancela la reserva.
do $$
declare bk uuid; pay uuid;
begin
  bk := book_single_class((select s2 from ids), (select vale from ids), 'transfer', null);
  select a.payment_id into pay from bookings b join payment_allocations a on a.charge_id = b.charge_id where b.id = bk;
  perform void_payment(pay, 'Pagó mal');
  assert (select status from bookings where id = bk) = 'cancelled', 'reserva suelta cancelada';
  raise notice 'OK  clase suelta anulada';
end $$;

-- 3. Mercado Pago: la devolución desde MP anula el pago (y repetir no hace nada).
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select create_purchase('pack', (select vale from ids), (select pack10 from ids));
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare p uuid; a bigint;
begin
  select id, amount_cents into p, a from purchases where status = 'pending' limit 1;
  assert fulfill_purchase(p, '777', a) = 'approved', 'cobrada por MP';
  assert refund_mp_payment('777') = 1, 'anuló';
  assert refund_mp_payment('777') = 0, 'idempotente';
end $$;
reset role;
do $$
begin
  assert (select status from payments where reference = 'MP 777') = 'void', 'pago anulado';
  assert (select balance_remaining(b.id) from class_balances b join payment_allocations a on a.charge_id = b.charge_id
          join payments p on p.id = a.payment_id where p.reference = 'MP 777') = 0, 'pack sin clases';
  raise notice 'OK  devolución de Mercado Pago';
end $$;

-- 4. Un alumno no puede registrar devoluciones.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  perform refund_mp_payment('777');
  raise exception 'el alumno anuló';
exception when insufficient_privilege then
  raise notice 'OK  sólo el servidor';
end $$;

rollback;
