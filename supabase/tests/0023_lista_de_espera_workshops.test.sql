-- Pruebas de la lista de espera de workshops. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('b1000000-0000-0000-0000-00000000000b', 'sofi@example.com', '{"first_name":"Sofía","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
reset role;

-- Workshop con cupo 1 en 5 días.
insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
with w as (insert into workshops (academy_id, title, price_cents, capacity, status)
           select id, 'Heels intensivo', 3000000, 1, 'published' from academies returning id, academy_id)
insert into workshop_sessions (academy_id, workshop_id, starts_at, ends_at, room_id)
select academy_id, id, now() + interval '5 days', now() + interval '5 days 2 hours', (select id from rooms limit 1) from w;

create temp table ids as
select (select id from workshops limit 1) as w,
       (select id from students where first_name = 'Valentina') as vale,
       (select id from students where first_name = 'Sofía') as sofi;
grant select on ids to authenticated;

-- 1. Recepción inscribe a Vale (cupo lleno). Sofi se anota desde la app; recepción anota a una externa.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select enroll_workshop((select w from ids), (select vale from ids), 'cash', null);
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert join_workshop_waitlist((select w from ids)) = 1, 'Sofi primera';
  begin
    perform join_workshop_waitlist((select w from ids));
    raise exception 'no se anota dos veces';
  exception when unique_violation then null;
  end;
  raise notice 'OK  anotarse desde la app';
end $$;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  assert join_workshop_waitlist_guest((select w from ids), 'Carla', 'Externa', '1155554444', '30111222') = 2, 'Carla segunda';
  assert (select status from students where dni = '30111222') = 'occasional', 'ficha ocasional';
  assert (select count(*) from workshop_waitlist_view((select w from ids))) = 2, 'recepción ve la lista';
  assert (select phone from workshop_waitlist_view((select w from ids)) where full_name = 'Carla Externa') = '1155554444', 'con teléfono';
  raise notice 'OK  recepción anota a alguien de afuera';
end $$;

-- 2. Vale cancela: el lugar se le guarda a Sofi (nadie más se puede inscribir) y le llega el aviso.
do $$
begin
  perform cancel_workshop_registration((select id from workshop_registrations limit 1), 'No puede');
  assert (select status from workshop_waitlist where student_id = (select sofi from ids)) = 'offered', 'guardado para Sofi';
  assert (select offer_expires_at from workshop_waitlist where student_id = (select sofi from ids)) between now() + interval '23 hours' and now() + interval '25 hours', '24 h';
  begin
    perform enroll_workshop((select w from ids), (select id from students where dni = '30111222'), 'cash', null);
    raise exception 'Carla no puede tomar el lugar guardado';
  exception when raise_exception then
    if sqlerrm not like 'No hay lugar%' then raise; end if;
  end;
  raise notice 'OK  lugar guardado para la primera';
end $$;
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select count(*) from notifications where kind = 'waitlist_offer') = 1, 'aviso a Sofi';
  assert (select body from notifications where kind = 'waitlist_offer') like '%pagá $30.000 en recepción%', (select body from notifications where kind = 'waitlist_offer');
  assert (select queue_position from workshop_waitlist_view()) = 1, 've su puesto';
  assert (select phone from workshop_waitlist_view()) is null, 'no ve teléfonos';
  raise notice 'OK  aviso del lugar liberado';
end $$;

-- 3. Sofi paga en recepción y queda inscripta.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform enroll_workshop((select w from ids), (select sofi from ids), 'qr', null);
  assert (select status from workshop_waitlist where student_id = (select sofi from ids)) = 'enrolled', 'inscripta desde la lista';
  raise notice 'OK  pagar el lugar guardado';
end $$;

-- 4. Sofi cancela: se le guarda a Carla; Carla no llega a pagar y vence; la lista queda vacía.
do $$
begin
  perform cancel_workshop_registration((select id from workshop_registrations where student_id = (select sofi from ids) and status = 'confirmed'), null);
  assert (select status from workshop_waitlist where student_id = (select id from students where dni = '30111222')) = 'offered', 'ahora es de Carla';
end $$;
reset role;
update workshop_waitlist set offer_expires_at = now() - interval '1 minute' where status = 'offered';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform refresh_workshop_waitlists();
  assert (select status from workshop_waitlist where student_id = (select id from students where dni = '30111222')) = 'expired', 'venció';
  assert (select taken + held from workshop_taken_counts() where workshop_id = (select w from ids)) = 0, 'lugar libre';
  begin
    perform join_workshop_waitlist((select w from ids), (select vale from ids));
    raise exception 'con lugar no hay lista';
  exception when raise_exception then
    if sqlerrm not like 'Hay lugar%' then raise; end if;
  end;
  raise notice 'OK  oferta vencida y lugar libre';
end $$;

rollback;
