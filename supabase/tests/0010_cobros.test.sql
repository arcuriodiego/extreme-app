-- Pruebas de cobros: primer pago, cobro total, meses siguientes, anulaciones y visibilidad.
\set ON_ERROR_STOP on
begin;

-- 1. Fechas ancladas: el día se mantiene y se ajusta en meses cortos.
do $$
begin
  assert add_months_anchored('2026-10-10', 1, 10) = '2026-11-10', '10/10 → 10/11';
  assert add_months_anchored('2026-01-31', 1, 31) = '2026-02-28', '31/1 → 28/2';
  assert add_months_anchored('2026-02-28', 1, 31) = '2026-03-31', 'vuelve al 31';
  assert add_months_anchored('2026-12-15', 1, 15) = '2027-01-15', 'cambio de año';
  assert add_months_anchored('2028-01-30', 1, 30) = '2028-02-29', 'año bisiesto';
  raise notice 'OK  vencimientos anclados';
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'martina@example.com', '{"first_name":"Martina","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('b1000000-0000-0000-0000-00000000000b', 'sofi@example.com', '{"first_name":"Sofía","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
insert into rooms (branch_id, name, capacity) values ((select id from branches limit 1), 'Sala 1', 25);
insert into class_groups (style_id, age_category_id, teacher_id, capacity)
values ((select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Teens'), (select id from teachers limit 1), 20);
insert into class_schedules (group_id, weekday, start_time, end_time, room_id) values
  ((select id from class_groups limit 1), 2, '19:00', '20:30', (select id from rooms limit 1)),
  ((select id from class_groups limit 1), 4, '19:00', '20:30', (select id from rooms limit 1));

-- Paula (recepción) inscribe a Vale y a Sofía.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select enroll_teacher_monthly(s.id, (select id from teachers limit 1), (select id from age_categories where name = 'Teens'),
                              array(select id from class_schedules order by weekday))
from students s where s.first_name in ('Valentina', 'Sofía');

create temp table ids as
select (select m.id from memberships m join students s on s.id = m.student_id where s.first_name = 'Valentina') as m_vale,
       (select m.id from memberships m join students s on s.id = m.student_id where s.first_name = 'Sofía') as m_sofi;
grant select on ids to authenticated;

-- 2. Primer pago completo: fija el día de vencimiento y emite el primer mes al precio vigente.
do $$
declare
  v_m uuid := (select m_vale from ids);
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  c charges;
begin
  perform first_membership_payment(v_m, 5550000, 'cash', null);
  assert (select anchor_day from memberships where id = v_m) = extract(day from v_today), 'vence el día del primer pago';
  select * into c from charges where membership_id = v_m;
  assert c.status = 'paid' and c.paid_cents = 5550000 and c.total_cents = 5550000, 'cargo pagado';
  assert c.period_start = v_today and c.period_end = add_months_anchored(v_today, 1, extract(day from v_today)::int) - 1, 'período de un mes';
  begin
    perform first_membership_payment(v_m, 100, 'cash', null);
    raise exception 'no debe aceptar un segundo primer pago';
  exception when raise_exception then
    if sqlerrm not like 'Esa cuota ya tiene%' then raise; end if;
  end;
  raise notice 'OK  primer pago';
end $$;

-- 3. Se cobra el total: no se aceptan pagos parciales ni de más.
do $$
declare v_charge uuid;
begin
  begin
    perform first_membership_payment((select m_sofi from ids), 2000000, 'transfer', 'OP-123');
    raise exception 'no debe aceptar un primer pago parcial';
  exception when invalid_parameter_value then
    if sqlerrm not like 'Se cobra el total%' then raise; end if;
  end;
  assert (select anchor_day from memberships where id = (select m_sofi from ids)) is null, 'el rechazo no deja nada a medias';
  perform first_membership_payment((select m_sofi from ids), 5550000, 'qr', 'OP-123');
  select id into v_charge from charges where membership_id = (select m_sofi from ids);
  assert (select status from charges where id = v_charge) = 'paid', 'pagado completo';
  begin
    perform pay_charge(v_charge, 5550000, 'cash', null);
    raise exception 'no debe cobrar dos veces';
  exception when no_data_found then null;
  end;
  assert (select count(*) from payments where student_id = (select student_id from memberships where id = (select m_sofi from ids))) = 1,
    'un solo pago registrado';
  raise notice 'OK  se cobra el total';
end $$;

-- 4. El profe no ve montos; la alumna ve sólo lo suyo.
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
begin
  assert (select count(*) from charges) = 0 and (select count(*) from payments) = 0, 'el profe no ve cobros';
  raise notice 'OK  el profe no ve montos';
end $$;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select count(*) from charges) = 1 and (select count(*) from payments) = 1, 'la alumna ve sólo lo suyo';
  begin
    perform pay_charge((select id from charges limit 1), 1, 'cash', null);
    raise exception 'la alumna no registra pagos';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la alumna ve lo suyo';
end $$;

-- 5. Anular: recepción no puede; administración sí, con motivo, y el cargo vuelve a deberse.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform void_payment((select id from payments where method = 'qr'), 'error');
  raise exception 'recepción no debe anular';
exception when insufficient_privilege then
  raise notice 'OK  recepción no anula';
end $$;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare v_charge uuid := (select id from charges where membership_id = (select m_sofi from ids));
begin
  perform void_payment((select id from payments where method = 'qr'), 'Cargado dos veces');
  assert (select status from charges where id = v_charge) = 'open', 'vuelve a deberse';
  assert (select paid_cents from charges where id = v_charge) = 0, 'el pago anulado no cuenta';
  begin
    perform pay_charge(v_charge, 4000000, 'cash', null);
    raise exception 'no debe aceptar un pago parcial';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'OK  anulación';
end $$;

reset role;

-- 6. Meses siguientes: simulamos que Vale pagó hace 29 días (el próximo vence en 2 días).
do $$
declare
  v_m uuid := (select m_vale from ids);
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_first date := v_today - 29;
  v_anchor int := extract(day from v_today - 29)::int;
  v_next date;
begin
  update memberships set anchor_day = v_anchor where id = v_m;
  update charges set period_start = v_first, due_date = v_first,
                     period_end = add_months_anchored(v_first, 1, v_anchor) - 1
   where membership_id = v_m;
  v_next := add_months_anchored(v_first, 1, v_anchor);

  perform generate_membership_charges((select academy_id from memberships where id = v_m));
  -- 29 días después del primer pago, el próximo vencimiento cae entre ayer y dentro de 2 días.
  assert v_next <= v_today + 3, 'el próximo vencimiento está dentro del aviso';
  assert exists (select 1 from charges where membership_id = v_m and period_start = v_next and status = 'open'
                 and amount_cents = 5550000), 'se emitió el mes siguiente';
  perform generate_membership_charges((select academy_id from memberships where id = v_m));
  assert (select count(*) from charges where membership_id = v_m and period_start = v_next) <= 1, 'sin duplicados';
  raise notice 'OK  meses siguientes';
end $$;

-- 7. Más de 30 días suspendida: no se siguen generando cuotas.
do $$
declare
  v_m uuid := (select m_vale from ids);
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_count int;
begin
  delete from payment_allocations where charge_id in (select id from charges where membership_id = v_m);
  delete from payments where student_id = (select student_id from memberships where id = v_m);
  delete from charges where membership_id = v_m;
  update memberships set anchor_day = extract(day from v_today - 45)::int where id = v_m;
  insert into charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
  select academy_id, student_id, 'membership', id, v_today - 45, v_today - 15, v_today - 45, 'Prueba', 5550000
  from memberships where id = v_m;
  select count(*) into v_count from charges where membership_id = v_m;
  perform generate_membership_charges((select academy_id from memberships where id = v_m));
  assert (select count(*) from charges where membership_id = v_m) = v_count, 'no genera más cuotas';
  raise notice 'OK  suspensión larga frena la generación';
end $$;

-- 8. La baja anula cargos futuros sin pagos.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare v_m uuid := (select m_sofi from ids);
begin
  reset role;
  insert into charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
  select academy_id, student_id, 'membership', id, current_date + 20, current_date + 49, current_date + 20, 'Futuro', 5550000
  from memberships where id = v_m;
  set local role authenticated;
  perform end_membership(v_m, 'prueba');
  assert (select status from charges where membership_id = v_m and description = 'Futuro') = 'void', 'cargo futuro anulado';
  assert (select status from charges where membership_id = v_m and description <> 'Futuro') = 'open',
    'lo ya adeudado sigue';
  raise notice 'OK  baja anula cargos futuros';
end $$;

reset role;

-- 9. Todo queda auditado con su autor.
do $$
begin
  assert exists (select 1 from audit_logs where table_name = 'payments' and actor_id = 'a0000000-0000-0000-0000-00000000000a'),
    'pagos auditados';
  assert exists (select 1 from audit_logs where table_name = 'payments' and action = 'update'
                 and actor_id = 'd0000000-0000-0000-0000-00000000000d'), 'anulación auditada';
  raise notice 'OK  auditoría de cobros';
end $$;

rollback;
