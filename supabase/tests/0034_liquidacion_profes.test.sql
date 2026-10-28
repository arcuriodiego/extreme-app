-- Liquidación de profes. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'agus@example.com', '{"first_name":"Agustina","academy":"extreme-dance"}'),
  ('e1000000-0000-0000-0000-00000000000e', 'luli@example.com', '{"first_name":"Luli","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
select grant_role('e1000000-0000-0000-0000-00000000000e', 'teacher');
reset role;

create temp table ids as select
  (select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'agus@example.com') as agus,
  (select t.id from teachers t join profiles p on p.id = t.profile_id where p.email = 'luli@example.com') as luli;
grant select on ids to authenticated;

insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, teacher_id, capacity, allows_single_booking)
select a.id, (select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Adultos'), (select agus from ids), 10, true from academies a;
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, capacity, substitute_teacher_id, status, cancel_reason)
select g.academy_id, g.id, ts, ts + interval '1 hour', (select id from rooms limit 1), 10, sub, st, why
from class_groups g,
     (values (timestamptz '2026-10-06 22:00+00', null::uuid, 'scheduled', null),
             (timestamptz '2026-10-13 22:00+00', (select luli from ids), 'scheduled', null),
             (timestamptz '2026-10-20 22:00+00', null::uuid, 'scheduled', null),
             (timestamptz '2026-10-27 22:00+00', null::uuid, 'cancelled', 'Feriado')) v(ts, sub, st, why);
insert into students (academy_id, first_name, last_name) select id, n, 'P' from academies, (values ('Vale'), ('Juan'), ('Ana')) v(n);

-- Cuota de Vale con Agustina, pagada en efectivo el 10 de octubre ($56.000).
insert into memberships (academy_id, student_id, plan_id, teacher_id, age_category_id, anchor_day)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'), (select agus from ids), (select id from age_categories where name = 'Adultos'), 10
from students s where s.first_name = 'Vale';
insert into charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
select m.academy_id, m.student_id, 'membership', m.id, '2026-10-10', '2026-11-09', '2026-10-10', 'Cuota oct', 5600000 from memberships m;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select pay_charge((select id from charges where description = 'Cuota oct'), 5600000, 'cash', null);
-- Juan compra un pack de 10 por transferencia (igual se liquida sobre el precio en efectivo).
select sell_pack((select id from students where first_name = 'Juan'), (select id from plans where name = 'Pack 10 clases'), 'transfer', null);
reset role;
update payments set paid_at = '2026-10-10 15:00+00';

-- Juan reserva con el pack la clase del 13 (la da Luli, reemplazo) y la del 27 (suspendida).
insert into bookings (academy_id, session_id, student_id, pay_kind, balance_id, status)
select s.academy_id, s.id, (select id from students where first_name = 'Juan'), 'pack', (select id from class_balances limit 1),
       case when s.status = 'cancelled' then 'cancelled' else 'confirmed' end
from class_sessions s where s.starts_at in ('2026-10-13 22:00+00', '2026-10-27 22:00+00');
-- Ana paga una clase suelta el 6 ($11.500) y usa un crédito el 20.
insert into charges (academy_id, student_id, concept, due_date, description, amount_cents)
select academy_id, id, 'single_class', '2026-10-06', 'Clase suelta', 1150000 from students where first_name = 'Ana';
insert into bookings (academy_id, session_id, student_id, pay_kind, charge_id)
select s.academy_id, s.id, (select id from students where first_name = 'Ana'), 'single', (select id from charges where description = 'Clase suelta')
from class_sessions s where s.starts_at = '2026-10-06 22:00+00';
insert into class_balances (academy_id, student_id, kind, units_total, valid_until, origin_booking_id)
select academy_id, student_id, 'credit', 1, '2026-10-30', id from bookings where pay_kind = 'single';
insert into bookings (academy_id, session_id, student_id, pay_kind, balance_id)
select s.academy_id, s.id, (select id from students where first_name = 'Ana'), 'credit', (select id from class_balances where kind = 'credit')
from class_sessions s where s.starts_at = '2026-10-20 22:00+00';
-- Una reserva cancelada a tiempo no cuenta.
insert into bookings (academy_id, session_id, student_id, pay_kind, balance_id, status)
select s.academy_id, s.id, (select id from students where first_name = 'Juan'), 'pack', (select id from class_balances where kind = 'pack'), 'cancelled'
from class_sessions s where s.starts_at = '2026-10-20 22:00+00';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare v_pack bigint := plan_price_on((select id from plans where name = 'Pack 10 clases'), current_date);
begin
  assert (select share_cents from teacher_payroll('2026-10-01') where concept = 'cuota') = 2800000, 'cuota: 50% de $56.000';
  assert (select teacher_name from teacher_payroll('2026-10-01') where concept = 'cuota') = 'Agustina', 'al profe de la cuota';
  assert (select count(*) from teacher_payroll('2026-10-01') where concept = 'pack') = 1, 'una clase de pack (la suspendida no)';
  assert (select teacher_name from teacher_payroll('2026-10-01') where concept = 'pack') = 'Luli', 'al reemplazo';
  assert (select base_cents from teacher_payroll('2026-10-01') where concept = 'pack') = v_pack / 10, 'precio del pack / 10';
  assert (select share_cents from teacher_payroll('2026-10-01') where concept = 'suelta') = 575000, 'suelta: 50% de $11.500';
  assert (select share_cents from teacher_payroll('2026-10-01') where concept = 'credito') = 575000, 'crédito: como la suelta de origen';
  assert (select count(*) from teacher_payroll('2026-10-01')) = 4, format('cuatro líneas: %s', (select count(*) from teacher_payroll('2026-10-01')));
  assert not exists (select 1 from teacher_payroll('2026-11-01')), 'noviembre vacío';
  raise notice 'OK  liquidación de octubre';
end $$;

-- El porcentaje es una regla.
do $$
begin
  perform update_settings('{"teacher_share_pct": 40}');
  assert (select share_cents from teacher_payroll('2026-10-01') where concept = 'cuota') = 2240000, '40%';
  raise notice 'OK  porcentaje editable';
end $$;

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform teacher_payroll('2026-10-01');
  raise exception 'recepción ve la liquidación';
exception when insufficient_privilege then
  raise notice 'OK  sólo administración';
end $$;

-- Modalidad: Luli cobra por quincena.
reset role;
update teachers set pay_period = 'fortnight' where id = (select luli from ids);
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  assert (select pay_period from teacher_payroll('2026-10-01') where concept = 'pack') = 'fortnight', 'Luli por quincena';
  assert (select pay_period from teacher_payroll('2026-10-01') where concept = 'cuota') = 'month', 'Agustina mensual';
  raise notice 'OK  modalidad de cobro';
end $$;

rollback;
