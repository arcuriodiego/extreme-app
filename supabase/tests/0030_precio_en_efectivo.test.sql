-- Pruebas del precio en efectivo: efectivo = precio cargado; otros medios = + 21 %. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
insert into teachers (academy_id, profile_id, display_name) select academy_id, id, 'Diego' from profiles where email = 'diego@example.com';
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
reset role;

-- Tres cargos de $56.000 (precio en efectivo) para Valentina.
insert into charges (academy_id, student_id, concept, due_date, description, amount_cents)
select s.academy_id, s.id, 'other', current_date, 'Cuota ' || n, 5600000
from students s, generate_series(1, 3) n where s.first_name = 'Valentina';

do $$
begin
  assert (select setting((select id from academies limit 1), 'non_cash_surcharge_pct')) = 21, 'recargo inicial 21 %';
  assert (select count(*) from charges where cash_amount_cents = 5600000 and amount_cents = 6776000) = 3, '56.000 y 67.760';
  assert non_cash_price((select id from academies limit 1), 5550000) = 6715500, '55.500 → 67.155';
  raise notice 'OK  cada cargo guarda los dos precios';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';

-- 1. En efectivo se cobra $56.000 y el cargo queda pagado.
do $$
declare c uuid := (select id from charges where description = 'Cuota 1');
begin
  perform pay_charge(c, 5600000, 'cash', null);
  assert (select status from charges where id = c) = 'paid', 'pagado';
  assert (select discount_cents from charges where id = c) = 1176000, 'descuento por efectivo';
  assert (select p.amount_cents from payments p join payment_allocations a on a.payment_id = p.id where a.charge_id = c) = 5600000, 'entró $56.000';
  raise notice 'OK  efectivo: $56.000';
end $$;

-- 2. Con transferencia se cobra $67.760; el precio en efectivo no sirve.
do $$
declare c uuid := (select id from charges where description = 'Cuota 2');
begin
  begin
    perform pay_charge(c, 5600000, 'transfer', null);
    raise exception 'transferencia al precio en efectivo';
  exception when invalid_parameter_value then null;
  end;
  perform pay_charge(c, 6776000, 'transfer', null);
  assert (select status from charges where id = c) = 'paid', 'pagado';
  assert (select discount_cents from charges where id = c) = 0, 'sin descuento';
  raise notice 'OK  transferencia: $67.760';
end $$;

-- 3. En efectivo no se puede pagar el precio de otros medios (recepción vio el importe equivocado).
do $$
begin
  perform pay_charge((select id from charges where description = 'Cuota 3'), 6776000, 'cash', null);
  raise exception 'efectivo con el otro precio';
exception when invalid_parameter_value then
  raise notice 'OK  el importe tiene que coincidir con el medio';
end $$;

-- 4. Si se anula el pago en efectivo, el cargo vuelve a costar $67.760 (o $56.000 en efectivo).
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare c uuid := (select id from charges where description = 'Cuota 1');
begin
  perform void_payment((select a.payment_id from payment_allocations a where a.charge_id = c), 'Error de carga');
  assert (select status from charges where id = c) = 'open', 'abierto';
  assert (select discount_cents from charges where id = c) = 0, 'sin descuento';
  assert (select total_cents from charges where id = c) = 6776000, 'total de otros medios';
  perform pay_charge(c, 5600000, 'cash', null);
  assert (select status from charges where id = c) = 'paid', 'se vuelve a cobrar en efectivo';
  raise notice 'OK  anular y volver a cobrar';
end $$;

-- 5. Packs: en efectivo el precio cargado; con QR, + 21 %.
do $$
declare
  v_price bigint := plan_price_on((select id from plans where name = 'Pack 10 clases'), current_date);
  vale uuid := (select id from students where first_name = 'Valentina');
begin
  perform sell_pack(vale, (select id from plans where name = 'Pack 10 clases'), 'cash', null);
  assert exists (select 1 from payments where method = 'cash' and amount_cents = v_price), 'pack en efectivo';
  perform sell_pack(vale, (select id from plans where name = 'Pack 10 clases'), 'qr', null);
  assert exists (select 1 from payments where method = 'qr' and amount_cents = non_cash_price((select id from academies limit 1), v_price)), 'pack con QR';
  raise notice 'OK  packs';
end $$;

-- 6. El recargo es una regla editable (0 a 50 %).
do $$
begin
  perform update_settings('{"non_cash_surcharge_pct": 60}');
  raise exception 'pasa 60 por ciento';
exception when invalid_parameter_value then
  raise notice 'OK  recargo con límite';
end $$;
do $$
begin
  perform update_settings('{"non_cash_surcharge_pct": 10}');
  assert non_cash_price((select id from academies limit 1), 5600000) = 6160000, '56.000 + 10 %';
  raise notice 'OK  recargo editable';
end $$;

-- 7. El aviso de cuota por vencer dice los dos precios.
reset role;
insert into memberships (academy_id, student_id, plan_id, teacher_id, age_category_id, anchor_day)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'),
       (select id from teachers limit 1), (select id from age_categories where name = 'Adultos'), 1
from students s where s.first_name = 'Valentina';
insert into charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
select m.academy_id, m.student_id, 'membership', m.id, current_date + 2, current_date + 31, current_date + 2, 'Cuota nov', 5600000 from memberships m;
select generate_notifications(id) from academies;
do $$
begin
  assert (select body from notifications where kind = 'due_soon') = 'Son $61.600, o $56.000 en efectivo en recepción.',
    (select body from notifications where kind = 'due_soon');
  raise notice 'OK  aviso con los dos precios';
end $$;

rollback;
