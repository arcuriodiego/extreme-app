-- Pruebas de recibos numerados, cobro conjunto, datos para transferir y recordatorios. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'mora@example.com', '{"first_name":"Mora","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
reset role;

-- Cuotas: dos de Valentina y una de Mora (precio en efectivo $50.000; otros medios + recargo).
insert into charges (academy_id, student_id, concept, due_date, description, amount_cents)
select s.academy_id, s.id, 'other', current_date, s.first_name || ' cuota ' || n, 5000000
from students s, generate_series(1, 2) n where s.first_name in ('Valentina', 'Mora');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';

-- 1. Un pago suelto: su recibo es el N° 1 y pedirlo de nuevo devuelve el mismo.
do $$
declare
  c uuid := (select id from charges where description = 'Valentina cuota 1');
  p uuid;
  r1 uuid;
  r2 uuid;
begin
  p := pay_charge(c, 5000000, 'cash', null);
  r1 := receipt_for_payment(p);
  r2 := receipt_for_payment(p);
  assert r1 = r2, 'mismo recibo';
  assert (select number from receipts where id = r1) = 1, 'número 1';
  assert length((select token from receipts where id = r1)) = 36, 'código privado';
  raise notice 'OK  recibo de un pago';
end $$;

-- 2. Dos cuotas de hermanas juntas: un solo recibo (N° 2) con las dos; en efectivo, $50.000 cada una.
do $$
declare
  r uuid;
  v jsonb;
begin
  r := pay_charges(array[(select id from charges where description = 'Valentina cuota 2'),
                         (select id from charges where description = 'Mora cuota 1')], 'cash', null);
  assert (select number from receipts where id = r) = 2, 'número 2';
  assert (select count(*) from payments where receipt_id = r) = 2, 'dos pagos en el recibo';
  assert (select count(*) from charges where description in ('Valentina cuota 2', 'Mora cuota 1') and status = 'paid') = 2, 'pagadas';
  v := receipt_view((select token from receipts where id = r));
  assert (v->>'number')::int = 2 and (v->>'total_cents')::bigint = 10000000, format('total $100.000: %s', v);
  assert jsonb_array_length(v->'items') = 2, 'dos renglones';
  assert v->'methods' = '["cash"]'::jsonb, 'efectivo';
  raise notice 'OK  cobro conjunto con un recibo';
end $$;

-- 3. Si una cuota ya está pagada, el cobro conjunto no cobra ninguna.
do $$
begin
  begin
    perform pay_charges(array[(select id from charges where description = 'Mora cuota 2'),
                              (select id from charges where description = 'Mora cuota 1')], 'transfer', 'op 123');
    assert false, 'no debería cobrar';
  exception when no_data_found then null;
  end;
  assert (select status from charges where description = 'Mora cuota 2') = 'open', 'sigue abierta';
  raise notice 'OK  todo o nada';
end $$;

-- 4. Un pago que ya tiene recibo no se puede meter en otro.
do $$
begin
  perform issue_receipt(array[(select a.payment_id from payment_allocations a join charges c on c.id = a.charge_id
                               where c.description = 'Valentina cuota 1'),
                              (select a.payment_id from payment_allocations a join charges c on c.id = a.charge_id
                               where c.description = 'Mora cuota 1')]);
  assert false, 'no debería';
exception when unique_violation then
  raise notice 'OK  un pago, un recibo';
end $$;

-- 5. El link sin sesión: con el código exacto muestra el recibo; con otro, nada.
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  assert receipt_view((select token from receipts where number = 1)) is null, 'anon no lee la tabla';
exception when insufficient_privilege then
  raise notice 'OK  anon no lee la tabla de recibos';
end $$;
reset role;
create temp table tok as select token from receipts where number = 1;
grant select on tok to anon;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  assert (receipt_view((select token from tok))->>'number')::int = 1, 'con el código';
  assert receipt_view('0000000000000000000000000000000000') is null, 'código inventado';
  assert receipt_view('') is null, 'vacío';
  raise notice 'OK  link público con código';
end $$;

-- 6. Si se anula un pago, el recibo lo muestra anulado.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare p uuid := (select a.payment_id from payment_allocations a join charges c on c.id = a.charge_id where c.description = 'Valentina cuota 1');
begin
  perform void_payment(p, 'Error de carga');
  assert (receipt_view((select r.token from receipts r join payments x on x.receipt_id = r.id where x.id = p))->>'void')::boolean, 'anulado';
  raise notice 'OK  recibo anulado';
end $$;

-- 7. Alumna: ve sus recibos, no cobra ni emite.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select count(*) from receipts) = 2, format('ve sus 2 recibos: %s', (select count(*) from receipts));
  begin
    perform pay_charges(array[(select id from charges where description = 'Mora cuota 2')], 'cash', null);
    assert false, 'no debería cobrar';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la alumna sólo ve lo suyo';
end $$;

-- 8. Datos para transferir: sólo administración; se guardan limpios y los ve la alumna.
do $$
begin
  perform update_transfer_info('extreme.dance', '0000003100000000000001', 'Extreme Dance', 'Banco');
  assert false, 'la alumna no debería';
exception when insufficient_privilege then null;
end $$;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select update_transfer_info(' extreme.dance ', '0000003-100000000000001', 'Extreme Dance SRL', '');
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select transfer_alias from academies) = 'extreme.dance', 'alias';
  assert (select transfer_cbu from academies) = '0000003100000000000001', 'CBU sin guiones';
  assert (select transfer_bank from academies) is null, 'banco vacío';
  raise notice 'OK  datos para transferir';
end $$;

-- 9. Recordatorios: recepción los registra y los ve; la alumna no.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select log_fee_reminder('familia-mora', array[(select id from charges where description = 'Mora cuota 2')]);
do $$
begin
  assert (select count(*) from fee_reminders) = 1, 'registrado';
  begin
    perform log_fee_reminder('x', array['00000000-0000-0000-0000-000000000000'::uuid]);
    assert false, 'cuota inventada';
  exception when no_data_found then null;
  end;
end $$;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select count(*) from fee_reminders) = 0, 'la alumna no los ve';
  raise notice 'OK  recordatorios';
end $$;

rollback;
