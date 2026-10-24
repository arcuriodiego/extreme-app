-- Pruebas de la lista de espera. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}'),
  ('b1000000-0000-0000-0000-00000000000b', 'sofi@example.com', '{"first_name":"Sofía","academy":"extreme-dance"}'),
  ('b2000000-0000-0000-0000-00000000000b', 'lu@example.com', '{"first_name":"Lucía","academy":"extreme-dance"}'),
  ('b3000000-0000-0000-0000-00000000000b', 'nico@example.com', '{"first_name":"Nicolás","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
reset role;

-- Una clase con cupo 1 en 2 días.
insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, capacity)
select id, (select id from dance_styles where name = 'Heels'), (select id from age_categories where name = 'Adultos'), 1 from academies;
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, capacity)
select academy_id, id, now() + interval '2 days', now() + interval '2 days 1 hour', (select id from rooms limit 1), 1 from class_groups;

create temp table ids as
select (select id from students where first_name = 'Valentina') as vale,
       (select id from students where first_name = 'Sofía') as sofi,
       (select id from students where first_name = 'Lucía') as lu,
       (select id from students where first_name = 'Nicolás') as nico,
       (select id from class_sessions limit 1) as clase;
grant select on ids to authenticated;

-- Recepción vende packs a Vale, Sofi y Lu (Nico no tiene).
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select sell_pack(s, (select id from plans where name = 'Pack 10 clases'), 'cash', null)
from (select unnest(array[vale, sofi, lu]) s from ids) x;

-- 1. Vale reserva el único lugar; Sofi y Lu se anotan en la lista.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select book_session((select clase from ids));
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
do $$
begin
  begin
    perform book_session((select clase from ids));
    raise exception 'no debe reservar sin lugar';
  exception when raise_exception then
    if sqlerrm not like 'No hay lugar%' then raise; end if;
  end;
  assert join_waitlist((select clase from ids)) = 1, 'primera en la lista';
  begin
    perform join_waitlist((select clase from ids));
    raise exception 'no se anota dos veces';
  exception when unique_violation then null;
  end;
  raise notice 'OK  anotarse en la lista';
end $$;
set local request.jwt.claims = '{"sub":"b2000000-0000-0000-0000-00000000000b"}';
select join_waitlist((select clase from ids));
set local request.jwt.claims = '{"sub":"b3000000-0000-0000-0000-00000000000b"}';
do $$
begin
  perform join_waitlist((select clase from ids));
  raise exception 'sin pack no se anota';
exception when raise_exception then
  if sqlerrm not like 'No tenés clases disponibles%' then raise; end if;
  raise notice 'OK  sin saldo no se anota';
end $$;

-- 2. Vale cancela: el lugar se le ofrece a Sofi (guardado: Lu no lo puede tomar).
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select cancel_booking((select id from bookings where status = 'confirmed' limit 1));
set local request.jwt.claims = '{"sub":"b2000000-0000-0000-0000-00000000000b"}';
do $$
begin
  perform book_session((select clase from ids));
  raise exception 'el lugar ofrecido está guardado';
exception when raise_exception then
  if sqlerrm not like 'No hay lugar%' then raise; end if;
  raise notice 'OK  lugar guardado para la primera';
end $$;
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
do $$
declare v_e uuid;
begin
  select id into v_e from waitlist_entries where status = 'offered';
  assert v_e is not null, 'Sofi tiene la oferta';
  assert (select count(*) from notifications where kind = 'waitlist_offer') = 1, 'le llegó el aviso';
  assert (select title from notifications where kind = 'waitlist_offer') like 'Se liberó un lugar en tu clase del %', 'texto';
  perform accept_waitlist_offer(v_e);
  assert exists (select 1 from bookings where student_id = (select sofi from ids) and status = 'confirmed'), 'reservó';
  assert (select status from waitlist_entries where id = v_e) = 'accepted', 'aceptada';
  raise notice 'OK  confirmar el lugar';
end $$;

-- 3. Sofi cancela: se le ofrece a Lu, que lo rechaza; queda el lugar libre.
select cancel_booking((select id from bookings where student_id = (select sofi from ids) and status = 'confirmed'));
set local request.jwt.claims = '{"sub":"b2000000-0000-0000-0000-00000000000b"}';
do $$
begin
  perform leave_waitlist((select id from waitlist_entries where status = 'offered'));
  assert (select seats_left from session_availability(array[(select clase from ids)])) = 1, 'lugar libre';
  raise notice 'OK  rechazar el lugar';
end $$;

-- 4. Con lugar libre no hay lista; una oferta vencida pasa al siguiente.
do $$
begin
  perform join_waitlist((select clase from ids));
  raise exception 'con lugar se reserva directo';
exception when raise_exception then
  if sqlerrm not like 'Hay lugar%' then raise; end if;
  raise notice 'OK  con lugar no hay lista';
end $$;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select book_session((select clase from ids));
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
select join_waitlist((select clase from ids));
set local request.jwt.claims = '{"sub":"b2000000-0000-0000-0000-00000000000b"}';
select join_waitlist((select clase from ids));
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select cancel_booking((select id from bookings where student_id = (select vale from ids) and status = 'confirmed'));
reset role;
update waitlist_entries set offer_expires_at = now() - interval '1 minute' where status = 'offered';
set local role authenticated;
set local request.jwt.claims = '{"sub":"b2000000-0000-0000-0000-00000000000b"}';
do $$
begin
  perform refresh_waitlists();
  assert (select count(*) from waitlist_entries where status in ('waiting', 'offered')) = 1, 'Lu ve sólo lo suyo';
  assert (select status from waitlist_entries where status in ('waiting', 'offered')) = 'offered', 'ahora el lugar es de Lu';
end $$;
reset role;
do $$
begin
  assert (select status from waitlist_entries where student_id = (select sofi from ids) order by created_at desc limit 1) = 'expired', 'venció la de Sofi';
  raise notice 'OK  oferta vencida pasa al siguiente';
end $$;

rollback;
