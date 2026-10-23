-- Pruebas de workshops: inscripción, externos, cupo, salas, cancelación 48 h y devoluciones.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
insert into rooms (branch_id, name, capacity) values ((select id from branches limit 1), 'Sala 1', 25);

create temp table w (name text, id uuid);
grant all on w to authenticated;

-- Heels intensivo: en 5 días (se puede cancelar con devolución). Cupo 2.
with ins as (insert into workshops (title, teacher_name, price_cents, capacity, status)
             values ('Heels intensivo', 'Invitada', 2500000, 2, 'published') returning id)
insert into w select 'lejos', id from ins;
insert into workshop_sessions (workshop_id, starts_at, ends_at, room_id)
values ((select id from w where name = 'lejos'), now() + interval '5 days', now() + interval '5 days 3 hours', (select id from rooms limit 1));

-- Coreo: mañana (menos de 48 h).
with ins as (insert into workshops (title, price_cents, capacity, status)
             values ('Coreo express', 1000000, 10, 'published') returning id)
insert into w select 'cerca', id from ins;
insert into workshop_sessions (workshop_id, starts_at, ends_at, room_id)
values ((select id from w where name = 'cerca'), now() + interval '1 day', now() + interval '1 day 2 hours', (select id from rooms limit 1));

-- 1. Una jornada no puede pisar otra ocupación de la sala.
do $$
begin
  insert into workshop_sessions (workshop_id, starts_at, ends_at, room_id)
  values ((select id from w where name = 'cerca'), now() + interval '5 days 1 hour', now() + interval '5 days 2 hours', (select id from rooms limit 1));
  raise exception 'debió rechazar la sala ocupada';
exception when exclusion_violation then
  raise notice 'OK  jornadas sin superposición de sala';
end $$;

-- 2. Recepción inscribe a una alumna y a un externo; el externo queda como ficha Ocasional.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare v_reg uuid; v_guest uuid;
begin
  v_reg := register_workshop((select id from w where name = 'lejos'), (select id from students where first_name = 'Valentina'));
  assert (select c.total_cents from workshop_registrations r join charges c on c.id = r.charge_id where r.id = v_reg) = 2500000,
    'cargo con el precio del workshop';
  v_guest := register_workshop_guest((select id from w where name = 'lejos'), 'Carla', 'Externa', '11 5555-0000', '30.111.222');
  assert (select s.status from workshop_registrations r join students s on s.id = r.student_id where r.id = v_guest) = 'occasional',
    'externo como ficha ocasional';
  assert (select s.profile_id from workshop_registrations r join students s on s.id = r.student_id where r.id = v_guest) is null,
    'sin cuenta';
  raise notice 'OK  inscripción de alumna y externo';
end $$;

-- 3. Cupo completo y sin duplicados.
do $$
begin
  begin
    perform register_workshop_guest((select id from w where name = 'lejos'), 'Otra', '', null, null);
    raise exception 'debió rechazar por cupo';
  exception when raise_exception then
    if sqlerrm not like 'No hay lugar%' then raise; end if;
  end;
  perform register_workshop((select id from w where name = 'cerca'), (select id from students where first_name = 'Valentina'));
  begin
    perform register_workshop((select id from w where name = 'cerca'), (select id from students where first_name = 'Valentina'));
    raise exception 'debió rechazar la inscripción repetida';
  exception when unique_violation then null;
  end;
  -- El externo con el mismo DNI reutiliza su ficha.
  perform register_workshop_guest((select id from w where name = 'cerca'), 'Carla', 'Externa', null, '30111222');
  assert (select count(*) from students where dni = '30111222') = 1, 'una sola ficha por DNI';
  raise notice 'OK  cupo, duplicados y DNI';
end $$;

-- 4. Cancelación con 48 h o más: corresponde devolver lo pagado, y se registra la devolución.
do $$
declare v_reg uuid := (select r.id from workshop_registrations r join students s on s.id = r.student_id
                       where s.first_name = 'Valentina' and r.workshop_id = (select id from w where name = 'lejos'));
begin
  perform pay_charge((select charge_id from workshop_registrations where id = v_reg), 2500000, 'cash', null);
  assert cancel_workshop_registration(v_reg, 'No puede ir') = 2500000, 'devuelve todo';
  perform record_workshop_refund(v_reg, 'transfer');
  assert (select refunded_cents from workshop_registrations where id = v_reg) = 2500000, 'devolución registrada';
  assert (select count(*) from refunds where registration_id = v_reg and amount_cents = 2500000) = 1, 'en la tabla de devoluciones';
  begin
    perform record_workshop_refund(v_reg, 'cash');
    raise exception 'no debe devolver dos veces';
  exception when raise_exception then
    if sqlerrm not like 'No hay nada pendiente%' then raise; end if;
  end;
  raise notice 'OK  cancelación con devolución';
end $$;

-- 5. Cancelación con menos de 48 h: no se devuelve.
do $$
declare v_reg uuid := (select r.id from workshop_registrations r join students s on s.id = r.student_id
                       where s.first_name = 'Valentina' and r.workshop_id = (select id from w where name = 'cerca') and r.status = 'confirmed');
begin
  perform pay_charge((select charge_id from workshop_registrations where id = v_reg), 1000000, 'qr', null);
  assert cancel_workshop_registration(v_reg, 'Se enfermó') = 0, 'no devuelve';
  assert (select status from charges where id = (select charge_id from workshop_registrations where id = v_reg)) = 'paid',
    'lo pagado queda cobrado';
  raise notice 'OK  menos de 48 h sin devolución';
end $$;

-- 6. Cancelación sin pagos: el cargo se anula.
do $$
declare v_reg uuid := (select r.id from workshop_registrations r join students s on s.id = r.student_id
                       where s.first_name = 'Carla' and r.workshop_id = (select id from w where name = 'cerca'));
begin
  perform cancel_workshop_registration(v_reg, null);
  assert (select status from charges where id = (select charge_id from workshop_registrations where id = v_reg)) = 'void', 'cargo anulado';
  raise notice 'OK  sin pagos no queda deuda';
end $$;

-- 7. La alumna ve sólo sus inscripciones; no ve borradores; no inscribe.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
insert into workshops (title, price_cents, capacity) values ('Borrador', 100, 5);
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert not exists (select 1 from workshops where title = 'Borrador'), 'no ve borradores';
  assert (select count(*) from workshop_registrations) = 2, 've sólo las suyas';
  assert (select count(*) from refunds) = 1, 've su devolución';
  begin
    perform register_workshop((select id from workshops where title = 'Coreo express'), (select id from students limit 1));
    raise exception 'la alumna no inscribe';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la alumna ve lo suyo';
end $$;

-- 8. Cancelar el workshop entero libera la sala y deja devoluciones pendientes.
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
declare v_id uuid := (select id from w where name = 'lejos');
begin
  perform cancel_workshop(v_id);
  assert not exists (select 1 from room_occupancies o join workshop_sessions s on s.id = o.source_id where s.workshop_id = v_id),
    'sala liberada';
  assert (select refund_cents from workshop_registrations r join students s on s.id = r.student_id
          where s.first_name = 'Carla' and r.workshop_id = v_id) = 0, 'Carla no había pagado: nada que devolver';
  assert not exists (select 1 from workshop_registrations where workshop_id = v_id and status = 'confirmed'), 'todas canceladas';
  raise notice 'OK  cancelar workshop';
end $$;

reset role;
rollback;
