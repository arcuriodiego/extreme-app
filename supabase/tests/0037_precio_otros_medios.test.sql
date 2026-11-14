-- Pruebas de los dos precios por plan (efectivo y otros medios cargados a mano). Todo se deshace al final.
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

-- 1. Administración carga los dos precios (desde hoy, para probar los cobros).
do $$
begin
  perform set_plan_price((select id from plans where name = 'Pack 10 clases'), 6950000, current_date, 7400000);
  perform set_plan_price((select id from plans where name = 'Cuota de profe'), 5900000, current_date, 6400000);
  perform set_plan_price((select id from plans where name = 'Clase individual'), 1260000, current_date, 1350000);
  -- Sin el de otros medios: se calcula con el recargo (8,5 %).
  perform set_plan_price((select id from plans where name = 'Pack 16 clases'), 10000000, current_date);
  raise notice 'OK  precios cargados';
end $$;

reset role;
do $$
declare r record;
begin
  select * into r from plan_price_pair_on((select id from plans where name = 'Pack 10 clases'), current_date);
  assert r.cash_cents = 6950000 and r.other_cents = 7400000, format('pack 10: %s', r);
  select * into r from plan_price_pair_on((select id from plans where name = 'Pack 16 clases'), current_date);
  assert r.cash_cents = 10000000 and r.other_cents = 10850000, format('pack 16 con recargo 8,5 %%: %s', r);
  raise notice 'OK  los dos precios de cada plan';
end $$;

-- 2. Un precio programado a futuro no cambia el de hoy, y guarda su precio de otros medios.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select set_plan_price((select id from plans where name = 'Pack 10 clases'), 7000000, current_date + 30, 7600000);
reset role;
do $$
declare r record;
begin
  select * into r from plan_price_pair_on((select id from plans where name = 'Pack 10 clases'), current_date);
  assert r.other_cents = 7400000, 'hoy sigue 74.000';
  select * into r from plan_price_pair_on((select id from plans where name = 'Pack 10 clases'), current_date + 30);
  assert r.cash_cents = 7000000 and r.other_cents = 7600000, format('futuro: %s', r);
  raise notice 'OK  precio programado';
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';

-- 3. El de otros medios no puede ser menor que el de efectivo; recepción no puede cambiar precios.
do $$
begin
  perform set_plan_price((select id from plans where name = 'Pack 10 clases'), 7000000, current_date + 30, 6900000);
  raise exception 'aceptó otros medios más barato';
exception when invalid_parameter_value then
  raise notice 'OK  otros medios >= efectivo';
end $$;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform set_plan_price((select id from plans where name = 'Pack 10 clases'), 7000000, current_date + 30, 7600000);
  raise exception 'recepción cambió un precio';
exception when insufficient_privilege then
  raise notice 'OK  sólo administración';
end $$;

-- 4. Packs: en efectivo $69.500, con QR $74.000 (exactos, no el recargo).
do $$
declare vale uuid := (select id from students where first_name = 'Valentina');
begin
  perform sell_pack(vale, (select id from plans where name = 'Pack 10 clases'), 'cash', null);
  perform sell_pack(vale, (select id from plans where name = 'Pack 10 clases'), 'qr', null);
  assert exists (select 1 from payments where method = 'cash' and amount_cents = 6950000), 'pack en efectivo';
  assert exists (select 1 from payments where method = 'qr' and amount_cents = 7400000), 'pack con QR';
  assert (select count(*) from charges where concept = 'pack' and amount_cents = 7400000 and cash_amount_cents = 6950000) = 2, 'cargos con los dos precios';
  raise notice 'OK  packs con los dos precios';
end $$;

-- 5. Primer pago de la cuota con transferencia: $64.000.
reset role;
insert into memberships (academy_id, student_id, plan_id, teacher_id, age_category_id)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'),
       (select id from teachers limit 1), (select id from age_categories where name = 'Adultos')
from students s where s.first_name = 'Valentina';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare m uuid := (select id from memberships limit 1);
begin
  perform first_membership_payment(m, 6400000, 'transfer', null);
  assert (select amount_cents from charges where membership_id = m) = 6400000, 'cuota otros medios';
  assert (select cash_amount_cents from charges where membership_id = m) = 5900000, 'cuota efectivo';
  assert (select status from charges where membership_id = m) = 'paid', 'pagada';
  raise notice 'OK  primer pago de la cuota';
end $$;

-- 6. Las cuotas de los meses siguientes también salen con los dos precios.
reset role;
update app_settings set value = 10 where key = 'due_reminder_days';
do $$
declare
  m uuid := (select id from memberships limit 1);
  target date := (select d::date from generate_series(current_date, current_date + 10, interval '1 day') d
                  where extract(day from d) <= 28 order by d limit 1);
begin
  update memberships set anchor_day = extract(day from target)::int where id = m;
  update charges set period_start = (target - interval '1 month')::date, period_end = target - 1,
                     due_date = (target - interval '1 month')::date
   where membership_id = m;
  perform generate_membership_charges((select id from academies limit 1));
  assert (select amount_cents from charges where membership_id = m and period_start = target) = 6400000, 'mes siguiente otros medios';
  assert (select cash_amount_cents from charges where membership_id = m and period_start = target) = 5900000, 'mes siguiente efectivo';
  raise notice 'OK  cuotas siguientes';
end $$;

-- 7. Los cargos sueltos (sin plan) siguen con el recargo de las reglas.
insert into charges (academy_id, student_id, concept, due_date, description, amount_cents)
select s.academy_id, s.id, 'other', current_date, 'Otro', 1000000 from students s where s.first_name = 'Valentina';
do $$
begin
  assert (select amount_cents from charges where description = 'Otro') = 1090000, 'recargo de las reglas (8,5 %, redondeado a $100)';
  raise notice 'OK  cargos sin plan con recargo';
end $$;

-- 8. Precios de enero 2027 con 8,5 %, redondeados a $100: $64.000, $13.700, $75.400 y $117.200.
do $$
declare a uuid := (select id from academies limit 1);
begin
  assert non_cash_price(a, 5900000) = 6400000, 'cuota';
  assert non_cash_price(a, 1260000) = 1370000, 'clase';
  assert non_cash_price(a, 6950000) = 7540000, 'pack 10';
  assert non_cash_price(a, 10800000) = 11720000, 'pack 16';
  raise notice 'OK  recargo 8,5 %%';
end $$;

rollback;
