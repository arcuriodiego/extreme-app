-- Pruebas de reglamento y documentos. Todo se deshace al final.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000d', 'diego@example.com', '{"first_name":"Diego","academy":"extreme-dance"}'),
  ('a0000000-0000-0000-0000-00000000000a', 'paula@example.com', '{"first_name":"Paula","academy":"extreme-dance"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'vale@example.com', '{"first_name":"Valentina","academy":"extreme-dance"}');
select bootstrap_admin('diego@example.com');
-- Precio único (sin recargo por otros medios): estas pruebas son anteriores al precio en efectivo (0030).
update app_settings set value = 0 where key = 'non_cash_surcharge_pct';
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
reset role;

insert into rooms (academy_id, branch_id, name, capacity) select academy_id, id, 'Sala 1', 25 from branches;
insert into class_groups (academy_id, style_id, age_category_id, capacity)
select a.id, (select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Adultos'), 10 from academies a;
insert into class_schedules (academy_id, group_id, weekday, start_time, end_time, room_id, valid_from)
select academy_id, id, 2, '19:00', '20:00', (select id from rooms limit 1), current_date from class_groups;
create temp table sch as select id from class_schedules;
grant select on sch to authenticated;

-- 1. Sin reglamento cargado, la inscripción no lo pide.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert regulation_accepted(), 'sin reglamento no hace falta';
  perform submit_signup('self', '', '', '40123456', date '2000-01-01', '11 5555-1234', null, array(select id from sch), null);
  raise notice 'OK  sin reglamento';
end $$;

-- 2. Sólo administración publica; las versiones suben solas.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  perform publish_regulation('Reglamento', 'Texto');
  raise exception 'recepción no publica';
exception when insufficient_privilege then
  raise notice 'OK  recepción no publica el reglamento';
end $$;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  perform publish_regulation('Reglamento 2027', 'Cancelaciones con 12 h de anticipación.');
  perform publish_regulation('Reglamento 2027', 'Cancelaciones con 12 h. Gracia de 5 días.');
  assert (select max(version) from regulations) = 2, 'versión 2';
  assert (select version from regulations where id = current_regulation_id()) = 2, 'vigente la 2';
  raise notice 'OK  versiones';
end $$;

-- 3. Valentina: para volver a enviar la inscripción tiene que aceptar la vigente.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert not regulation_accepted(), 'todavía no aceptó';
  perform submit_signup('self', '', '', '40123456', date '2000-01-01', '11 5555-1234', null, array(select id from sch), null);
  raise exception 'sin aceptar pasa';
exception when invalid_parameter_value then
  raise notice 'OK  la inscripción pide el reglamento';
end $$;
do $$
begin
  perform accept_regulation((select id from regulations where version = 1));
  raise exception 'acepta una versión vieja';
exception when no_data_found then
  raise notice 'OK  no se acepta una versión vieja';
end $$;
do $$
begin
  perform accept_regulation(current_regulation_id());
  perform accept_regulation(current_regulation_id());
  assert regulation_accepted(), 'aceptó';
  assert (select count(*) from regulation_acceptances) = 1, 'una vez';
  perform submit_signup('self', '', '', '40123456', date '2000-01-01', '11 5555-1234', null, array(select id from sch), null);
  assert regulation_accepted('a0000000-0000-0000-0000-00000000000a'::uuid) = regulation_accepted(), 'no consulta a otros (responde por ella)';
  raise notice 'OK  acepta y se inscribe';
end $$;

-- 4. Recepción ve quién aceptó.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  assert (select count(*) from regulation_acceptances) = 1, 've las aceptaciones';
  assert regulation_accepted('b0000000-0000-0000-0000-00000000000b'), 'Valentina aceptó';
  raise notice 'OK  el personal ve las aceptaciones';
end $$;

-- 5. Documentos: recepción sube; la alumna ve los de todos, no los del personal.
do $$
declare a text := (select id::text from academies limit 1);
begin
  insert into storage.objects (bucket_id, name) values
    ('documentos', a || '/documentos/11111111-1111-1111-1111-111111111111.pdf'),
    ('documentos', a || '/documentos/22222222-2222-2222-2222-222222222222.pdf');
  insert into documents (title, file_path, mime_type, size_bytes, audience) values
    ('Horarios 2027', a || '/documentos/11111111-1111-1111-1111-111111111111.pdf', 'application/pdf', 1000, 'all'),
    ('Protocolo interno', a || '/documentos/22222222-2222-2222-2222-222222222222.pdf', 'application/pdf', 1000, 'staff');
  raise notice 'OK  recepción sube documentos';
end $$;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select count(*) from documents) = 1, 've un documento';
  assert (select title from documents) = 'Horarios 2027', 'el de todos';
  assert (select count(*) from storage.objects where bucket_id = 'documentos') = 1, 'sólo puede abrir ese archivo';
  raise notice 'OK  la alumna ve sólo los de todos';
end $$;
do $$
declare a text := (select academy_id::text from documents limit 1);
begin
  insert into documents (title, file_path, mime_type, size_bytes) values
    ('Mío', a || '/documentos/33333333-3333-3333-3333-333333333333.pdf', 'application/pdf', 1000);
  raise exception 'la alumna sube';
exception when insufficient_privilege then
  raise notice 'OK  la alumna no sube';
end $$;
do $$
begin
  delete from documents;
  assert (select count(*) from documents) = 1, 'no borra';
  raise notice 'OK  la alumna no borra';
end $$;

rollback;
