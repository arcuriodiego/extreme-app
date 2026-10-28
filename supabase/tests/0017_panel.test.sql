-- Pruebas del panel de gestión. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'martina@example.com', '{"first_name":"Martina","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('b1000000-0000-0000-0000-00000000000b', 'sofi@example.com', '{"first_name":"Sofía","academy":"extreme-dance"}'),
  ('b2000000-0000-0000-0000-00000000000b', 'lu@example.com', '{"first_name":"Lucía","academy":"extreme-dance"}'),
  ('b3000000-0000-0000-0000-00000000000b', 'nico@example.com', '{"first_name":"Nicolás","academy":"extreme-dance"}'),
  ('b4000000-0000-0000-0000-00000000000b', 'ana@example.com', '{"first_name":"Ana","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
-- Precio único (sin recargo por otros medios): estas pruebas son anteriores al precio en efectivo (0030).
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
reset role;

-- Una clase hoy al mediodía (hora de la academia), de un grupo sin horarios.
insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, teacher_id, capacity)
select a.id, (select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Adultos'),
       (select id from teachers where profile_id = 'e0000000-0000-0000-0000-00000000000e'), 12
from academies a;
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, teacher_id, capacity)
select g.academy_id, g.id,
       ((now() at time zone 'America/Argentina/Buenos_Aires')::date + time '12:00') at time zone 'America/Argentina/Buenos_Aires',
       ((now() at time zone 'America/Argentina/Buenos_Aires')::date + time '13:00') at time zone 'America/Argentina/Buenos_Aires',
       (select id from rooms limit 1), g.teacher_id, 12
from class_groups g;

-- Cuotas: Vale en gracia (debe hace 3 días), Lu suspendida (10), Nico suspendido hace mucho (60), Ana sin primer pago.
insert into memberships (academy_id, student_id, plan_id, teacher_id, age_category_id, anchor_day)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'), g.teacher_id, g.age_category_id,
       case when s.first_name = 'Ana' then null else 1 end
from students s, class_groups g where s.first_name in ('Valentina', 'Lucía', 'Nicolás', 'Ana');
insert into charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
select m.academy_id, m.student_id, 'membership', m.id, current_date + d, current_date + d + 29, current_date + d, 'Prueba', 5550000
from memberships m join students s on s.id = m.student_id
join (values ('Valentina', -3), ('Lucía', -10), ('Lucía', 2), ('Nicolás', -60)) v(n, d) on v.n = s.first_name;

-- Ingresos de hoy: dos que pasaron y uno rechazado.
insert into access_logs (academy_id, student_id, result, reason, method)
select academy_id, id, r, 'x', 'qr' from students, (values ('allowed'), ('grace'), ('denied')) v(r) where first_name = 'Valentina';

-- Recepción vende un pack a Sofi (cobro de hoy).
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select sell_pack((select id from students where first_name = 'Sofía'), (select id from plans where name = 'Pack 10 clases'), 'cash', null);

-- 1. Recepción: el día, las cuotas y la caja; sin los ingresos del mes.
do $$
declare d jsonb := dashboard_summary();
begin
  assert jsonb_array_length(d -> 'classes') = 1, 'una clase hoy';
  assert d -> 'classes' -> 0 ->> 'label' = 'Hip Hop · Adultos' and (d -> 'classes' -> 0 ->> 'capacity')::int = 12, 'clase con cupo';
  assert (d -> 'entries' ->> 'allowed')::int = 2 and (d -> 'entries' ->> 'denied')::int = 1, format('ingresos de hoy: %s', d -> 'entries');
  assert (d ->> 'active_students')::int = 5, format('activos: %s', d ->> 'active_students');
  assert (d -> 'memberships' ->> 'grace')::int = 1, 'una en gracia';
  assert (d -> 'memberships' ->> 'suspended')::int = 2, 'dos suspendidas';
  assert (d -> 'memberships' ->> 'long_suspended')::int = 1, 'una para decidir la baja';
  assert (d -> 'memberships' ->> 'unpaid_first')::int = 1, 'una sin primer pago';
  assert d -> 'memberships' -> 'list' -> 0 ->> 'name' = 'Nicolás' and d -> 'memberships' -> 'list' -> 0 ->> 'state' = 'long_suspended',
    'primero lo más urgente';
  assert (d -> 'memberships' ->> 'owed_cents')::bigint = 3 * 5550000, 'total adeudado';
  assert jsonb_array_length(d -> 'due_soon') = 1 and d -> 'due_soon' -> 0 ->> 'name' = 'Lucía', 'vence pronto';
  assert (d ->> 'cash_today')::bigint = 6600000, format('caja de hoy: %s', d ->> 'cash_today');
  assert not d ? 'month', 'recepción no ve el mes';
  raise notice 'OK  panel de recepción';
end $$;

-- 2. Administración: además, el mes por concepto y medio.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare d jsonb := dashboard_summary();
begin
  assert (d -> 'month' -> 'by_concept' ->> 'pack')::bigint = 6600000, 'packs del mes';
  assert (d -> 'month' -> 'by_method' ->> 'cash')::bigint = 6600000, 'efectivo del mes';
  assert (d -> 'month' ->> 'previous')::bigint = 0 and (d -> 'month' ->> 'refunds')::bigint = 0, 'mes anterior y devoluciones';
  raise notice 'OK  panel de administración';
end $$;

-- 3. El profe y la alumna no ven el panel.
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
begin
  perform dashboard_summary();
  raise exception 'el profe no ve el panel';
exception when insufficient_privilege then
  raise notice 'OK  el profe no ve el panel';
end $$;

rollback;
