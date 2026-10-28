-- Pruebas de tutores de menores. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'laura@example.com', '{"first_name":"Laura","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
-- Precio único (sin recargo por otros medios): estas pruebas son anteriores al precio en efectivo (0030).
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
reset role;

-- Mateo (9 años) no tiene cuenta: su ficha la crea recepción. Una clase en 2 días.
insert into students (academy_id, first_name, last_name, birth_date)
select id, 'Mateo', 'Fernández', current_date - interval '9 years' from academies;
insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, capacity)
select id, (select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Infantil'), 10 from academies;
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, capacity)
select academy_id, id, now() + interval '2 days', now() + interval '2 days 1 hour', (select id from rooms limit 1), 10 from class_groups;

create temp table ids as
select (select id from students where first_name = 'Mateo') as mateo,
       (select id from students where first_name = 'Valentina') as vale,
       (select id from students where first_name = 'Laura') as laura,
       (select id from class_sessions limit 1) as clase;
grant select on ids to authenticated;

-- 1. Recepción vincula a Laura como madre de Mateo y le vende un pack.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare v_link uuid;
begin
  v_link := link_guardian((select mateo from ids), 'LAURA@example.com', 'madre');
  assert v_link is not null, 'vínculo creado';
  assert (select is_primary from guardian_students where id = v_link), 'primer tutor = principal';
  assert link_guardian((select mateo from ids), 'laura@example.com', null) = v_link, 'vincular de nuevo no duplica';
  begin
    perform link_guardian((select mateo from ids), 'nadie@example.com', null);
    raise exception 'sin cuenta no se vincula';
  exception when no_data_found then
    if sqlerrm not like 'No hay ninguna cuenta%' then raise; end if;
  end;
  begin
    perform link_guardian((select vale from ids), 'vale@example.com', null);
    raise exception 'no es tutor de sí misma';
  exception when invalid_parameter_value then null;
  end;
  perform sell_pack((select mateo from ids), (select id from plans where name = 'Pack 10 clases'), 'cash', null);
  raise notice 'OK  vincular tutor';
end $$;

-- 2. Laura ve a Mateo como propio: su ficha, saldo, cargos y pagos; maneja su QR y reserva.
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
declare v_b uuid; k jsonb;
begin
  assert (select count(*) from my_students()) = 2, 'ella y Mateo';
  assert (select full_name from my_students() where not is_self) = 'Mateo Fernández', 'Mateo a cargo';
  assert (select role_codes from my_access()) @> '{guardian}', 'tiene el rol de tutor';
  assert exists (select 1 from students where id = (select mateo from ids)), 've la ficha';
  assert (select count(*) from class_balances where student_id = (select mateo from ids)) = 1, 've el pack';
  assert (select count(*) from charges where student_id = (select mateo from ids)) = 1, 've el cargo';
  assert (select count(*) from payments where student_id = (select mateo from ids)) = 1, 've el pago';
  k := my_access_key((select mateo from ids));
  assert k ->> 'student_id' = (select mateo from ids)::text, 'pase de Mateo';
  begin
    perform my_access_key((select vale from ids));
    raise exception 'no saca el pase de otra alumna';
  exception when no_data_found then null;
  end;
  v_b := book_session((select clase from ids), (select mateo from ids));
  assert (select student_id from bookings where id = v_b) = (select mateo from ids), 'reservó por Mateo';
  assert cancel_booking(v_b), 'canceló a tiempo';
  assert not exists (select 1 from students where id = (select vale from ids)), 'no ve a otros alumnos';
  begin
    perform book_session((select clase from ids), (select vale from ids));
    raise exception 'no reserva por otros';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la tutora maneja a su hijo';
end $$;

-- 3. Otra alumna no ve a Mateo.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert not exists (select 1 from students where id = (select mateo from ids)), 'no ve a Mateo';
  assert (select count(*) from guardian_students) = 0, 'no ve vínculos ajenos';
  assert (select count(*) from my_students()) = 1, 'sólo ella';
  raise notice 'OK  vínculos privados';
end $$;

-- 4. Sin permiso de reservar, la tutora sólo mira; al desvincular, deja de ver y de ser tutora.
reset role;
update guardian_students set can_book = false;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  perform book_session((select clase from ids), (select mateo from ids));
  raise exception 'sin permiso de reservar no reserva';
exception when insufficient_privilege then
  raise notice 'OK  tutor sin permiso de reservar';
end $$;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select unlink_guardian((select id from guardian_students limit 1));
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
begin
  assert not exists (select 1 from students where id = (select mateo from ids)), 'ya no ve a Mateo';
  assert not ((select role_codes from my_access()) @> '{guardian}'), 'ya no es tutora';
  raise notice 'OK  desvincular';
end $$;

-- 5. El alumno sigue viendo lo suyo (las políticas nuevas no le quitan nada).
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert exists (select 1 from students where id = (select vale from ids)), 've su ficha';
  assert (my_access_key() ->> 'student_id') = (select vale from ids)::text, 'su pase sin indicar alumno';
  raise notice 'OK  el alumno sigue viendo lo suyo';
end $$;

rollback;
