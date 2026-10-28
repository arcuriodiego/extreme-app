-- Pruebas de packs, reservas, cupo, cancelación de 12 h y créditos. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'martina@example.com', '{"first_name":"Martina","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('b1000000-0000-0000-0000-00000000000b', 'sofi@example.com', '{"first_name":"Sofía","academy":"extreme-dance"}'),
  ('b2000000-0000-0000-0000-00000000000b', 'lu@example.com', '{"first_name":"Lucía","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
-- Precio único (sin recargo por otros medios): estas pruebas son anteriores al precio en efectivo (0030).
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
insert into rooms (branch_id, name, capacity) values ((select id from branches limit 1), 'Sala 1', 25);
-- Grupo con cupo 2 y clases todos los días a las 23:00 (así siempre hay una a más de 12 h y una a menos).
insert into class_groups (style_id, age_category_id, teacher_id, capacity)
values ((select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Adultos'), (select id from teachers limit 1), 2);
insert into class_schedules (group_id, weekday, start_time, end_time, room_id)
select (select id from class_groups limit 1), d, '23:00', '23:45', (select id from rooms limit 1) from generate_series(1, 7) d;

-- Una clase extra dentro de 2 horas (en otra sala), para probar la cancelación tardía a cualquier hora.
reset role;
insert into rooms (academy_id, branch_id, name, capacity)
select academy_id, id, 'Sala 2', 25 from branches limit 1;
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, capacity)
select g.academy_id, g.id, now() + interval '2 hours', now() + interval '2 hours 15 minutes',
       (select id from rooms where name = 'Sala 2'), 2
from class_groups g limit 1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';

create temp table ids as
select (select id from students where first_name = 'Valentina') as vale,
       (select id from students where first_name = 'Sofía') as sofi,
       (select id from students where first_name = 'Lucía') as lu,
       (select id from plans where name = 'Pack 10 clases') as pack10,
       (select id from class_sessions where starts_at > now() + interval '13 hours' order by starts_at limit 1) as lejos,
       (select id from class_sessions where starts_at > now() + interval '13 hours' order by starts_at offset 1 limit 1) as lejos2,
       (select id from class_sessions where schedule_id is null order by starts_at limit 1) as cerca,
       (select id from class_sessions where starts_at > now() + interval '20 days' order by starts_at limit 1) as muy_lejos;
grant select on ids to authenticated;

-- 1. Recepción vende un pack con pago total: 10 clases por 1 mes.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare i ids; v_b uuid;
begin
  select * into i from ids;
  v_b := sell_pack(i.vale, i.pack10, 'cash', null);
  assert balance_remaining(v_b) = 10, '10 clases';
  assert (select c.status from class_balances b join charges c on c.id = b.charge_id where b.id = v_b) = 'paid', 'pagado';
  assert (select (valid_until at time zone 'America/Argentina/Buenos_Aires')::date from class_balances where id = v_b)
       = add_months_anchored((now() at time zone 'America/Argentina/Buenos_Aires')::date, 1,
                             extract(day from (now() at time zone 'America/Argentina/Buenos_Aires'))::int), 'vence en un mes';
  raise notice 'OK  venta de pack';
end $$;

-- 2. La alumna reserva con su pack; descuenta una clase; no puede reservar dos veces.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare i ids; v_bk uuid;
begin
  select * into i from ids;
  v_bk := book_session(i.lejos);
  assert balance_remaining((select balance_id from bookings where id = v_bk)) = 9, 'quedan 9';
  begin
    perform book_session(i.lejos);
    raise exception 'no debe reservar dos veces';
  exception when unique_violation then null;
  end;
  assert (select booked from session_availability(array[i.lejos])) = 1, 'una reserva';
  raise notice 'OK  reserva con pack';
end $$;

-- 3. Sin saldo no se reserva; la alumna no puede reservar por otra.
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
do $$
declare i ids;
begin
  select * into i from ids;
  begin
    perform book_session(i.lejos);
    raise exception 'sin saldo no debe reservar';
  exception when raise_exception then
    if sqlerrm not like 'No tenés clases disponibles%' then raise; end if;
  end;
  begin
    perform book_session(i.lejos, i.vale);
    raise exception 'no debe reservar por otra persona';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sin saldo y sin reservar por otros';
end $$;

-- 4. Clase individual en recepción: cobra y reserva. Cupo 2: la tercera persona no entra.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare i ids;
begin
  select * into i from ids;
  perform book_single_class(i.lejos, i.sofi, 'qr', null);
  assert (select seats_left from session_availability(array[i.lejos])) = 0, 'completa';
  begin
    perform book_single_class(i.lejos, i.lu, 'cash', null);
    raise exception 'debió rechazar por cupo';
  exception when raise_exception then
    if sqlerrm not like 'No hay lugar%' then raise; end if;
  end;
  assert not exists (select 1 from charges where student_id = i.lu), 'sin cobro si no hay lugar';
  raise notice 'OK  clase individual y cupo';
end $$;

-- 5. Un pack no sirve para una clase posterior a su vencimiento.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare i ids;
begin
  select * into i from ids;
  if i.muy_lejos is not null then
    reset role;
    update class_balances set valid_until = now() + interval '10 days' where student_id = i.vale;
    set local role authenticated;
    begin
      perform book_session(i.muy_lejos);
      raise exception 'no debe usar un pack vencido para esa fecha';
    exception when raise_exception then
      if sqlerrm not like 'No tenés clases disponibles%' then raise; end if;
    end;
  end if;
  raise notice 'OK  vencimiento del pack';
end $$;

-- 6. Cancelar con 12 h o más: la clase vuelve al pack.
do $$
declare i ids; v_bk uuid;
begin
  select * into i from ids;
  v_bk := (select id from bookings where session_id = i.lejos and student_id = i.vale and status = 'confirmed');
  assert cancel_booking(v_bk) = true, 'devuelve';
  assert balance_remaining((select balance_id from bookings where id = v_bk)) = 10, 'vuelve al pack';
  raise notice 'OK  cancelación a tiempo';
end $$;

-- 7. Cancelar con menos de 12 h: no se devuelve.
do $$
declare i ids; v_bk uuid;
begin
  select * into i from ids;
  v_bk := book_session(i.cerca);
  assert cancel_booking(v_bk) = false, 'no devuelve';
  assert balance_remaining((select balance_id from bookings where id = v_bk)) = 9, 'la clase se pierde';
  raise notice 'OK  cancelación tardía';
end $$;

-- 8. Clase individual cancelada a tiempo: crédito de 5 días, clase dentro de 14; se usa primero.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare i ids; v_bk uuid; v_credit public.class_balances; v_new uuid;
begin
  select * into i from ids;
  v_bk := (select id from bookings where session_id = i.lejos and student_id = i.sofi and status = 'confirmed');
  assert cancel_booking(v_bk) = true, 'devuelve';
  select * into v_credit from class_balances where origin_booking_id = v_bk;
  assert v_credit.kind = 'credit' and balance_remaining(v_credit.id) = 1, 'crédito de una clase';
  assert v_credit.valid_until between now() + interval '4 days 23 hours' and now() + interval '5 days 1 hour', '5 días';
  assert v_credit.class_window_until between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour', '14 días';
  v_new := book_session(i.lejos2, i.sofi);
  assert (select pay_kind from bookings where id = v_new) = 'credit', 'usa el crédito';
  raise notice 'OK  crédito por cancelación';
end $$;

-- 9. Si la academia suspende la clase, las reservas se devuelven solas.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare i ids;
begin
  select * into i from ids;
  perform cancel_session(i.lejos2, 'Corte de luz');
  assert not exists (select 1 from bookings where session_id = i.lejos2 and status = 'confirmed'), 'reservas canceladas';
  assert exists (select 1 from class_balances b where b.student_id = i.sofi and b.kind = 'credit'
                 and balance_remaining(b.id) = 1 and b.origin_booking_id is not null
                 and b.origin_booking_id in (select id from bookings where session_id = i.lejos2)), 'nuevo crédito';
  raise notice 'OK  suspensión devuelve las reservas';
end $$;

-- 10. El alumno fijo no reserva su propia clase; una clase con reservas no se borra.
do $$
declare i ids;
begin
  select * into i from ids;
  perform enroll_teacher_monthly(i.lu, (select id from teachers limit 1), (select id from age_categories where name = 'Adultos'),
    array(select id from class_schedules order by weekday limit 2));
  set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
  perform sell_pack(i.lu, i.pack10, 'cash', null);
  begin
    perform book_session(
      (select s.id from class_sessions s join enrollments e on e.schedule_id = s.schedule_id and e.student_id = i.lu
       where s.starts_at > now() + interval '1 hour' and s.status = 'scheduled' order by s.starts_at limit 1), i.lu);
    raise exception 'no debe reservar su clase fija';
  exception when unique_violation then null;
  end;
  raise notice 'OK  la clase fija no se reserva';
end $$;

reset role;
-- 11. La grilla no borra clases con historial: con reservas confirmadas da error claro;
--     con reservas ya canceladas, la clase queda suspendida (no se pierde el historial).
do $$
declare v_s uuid;
begin
  select s.id into v_s from class_sessions s
   where s.starts_at > now() + interval '1 day' and s.status = 'scheduled'
     and not exists (select 1 from bookings b where b.session_id = s.id)
   order by s.starts_at limit 1;
  insert into bookings (academy_id, session_id, student_id, pay_kind, balance_id)
  select academy_id, v_s, student_id, 'pack', id from class_balances where kind = 'pack' limit 1;
  begin
    delete from class_sessions where id = v_s;
    raise exception 'no debe borrar una clase con reservas confirmadas';
  exception when raise_exception then
    if sqlerrm not like 'Hay reservas confirmadas%' then raise; end if;
  end;
  select b.session_id into v_s from bookings b
   where b.status = 'cancelled'
     and not exists (select 1 from bookings b2 where b2.session_id = b.session_id and b2.status = 'confirmed')
   limit 1;
  assert v_s is not null, 'hay una clase con sólo reservas canceladas';
  delete from class_sessions where id = v_s;
  assert (select status from class_sessions where id = v_s) = 'cancelled', 'queda suspendida';
  assert (select cancel_reason from class_sessions where id = v_s) = 'Se quitó de la grilla', 'con motivo';
  delete from class_sessions where id = (select s.id from class_sessions s
    where not exists (select 1 from bookings b where b.session_id = s.id) order by starts_at desc limit 1);
  raise notice 'OK  clases con historial protegidas';
end $$;

-- 12. Un grupo cuyas clases sólo tuvieron reservas (aunque futuras) se cierra en vez de borrarse.
do $$
declare v_g uuid; v_s uuid; v_b uuid;
begin
  insert into class_groups (academy_id, style_id, age_category_id, capacity)
  select id, (select id from dance_styles where name = 'Heels'), (select id from age_categories where name = 'Adultos'), 5
  from academies limit 1 returning id into v_g;
  insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, capacity)
  select academy_id, v_g, now() + interval '3 days', now() + interval '3 days 1 hour', (select id from rooms where name = 'Sala 2'), 5
  from class_groups where id = v_g returning id into v_s;
  insert into bookings (academy_id, session_id, student_id, pay_kind, balance_id, status, cancelled_at)
  select academy_id, v_s, student_id, 'pack', id, 'cancelled', now() from class_balances where kind = 'pack' limit 1
  returning id into v_b;
  perform set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000d"}', true);
  set local role authenticated;
  assert delete_group(v_g) = 'archived', 'se cierra';
  reset role;
  assert (select status from class_groups where id = v_g) = 'closed', 'grupo cerrado';
  assert (select status from class_sessions where id = v_s) = 'cancelled', 'su clase queda suspendida';
  raise notice 'OK  grupo con reservas canceladas se cierra';
end $$;

rollback;
