-- Pruebas de acceso con QR y asistencia. Todo se deshace al final.
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

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('a0000000-0000-0000-0000-00000000000a', 'reception');
select grant_role('e0000000-0000-0000-0000-00000000000e', 'teacher');
reset role;

-- Datos: un grupo de Martina cuyo horario recién empieza en 60 días (no genera clases),
-- y una clase de ese horario que empieza en 20 minutos (dentro de la ventana de ingreso).
insert into rooms (academy_id, branch_id, name, capacity)
select academy_id, id, n, 25 from branches, (values ('Sala 1'), ('Sala 2')) v(n);
insert into class_groups (academy_id, style_id, age_category_id, teacher_id, capacity)
select a.id, (select id from dance_styles where name = 'Hip Hop'), (select id from age_categories where name = 'Adultos'),
       (select id from teachers where profile_id = 'e0000000-0000-0000-0000-00000000000e'), 10
from academies a;
insert into class_schedules (academy_id, group_id, weekday, start_time, end_time, room_id, valid_from)
select g.academy_id, g.id, 1, '10:00', '11:00', (select id from rooms where name = 'Sala 1'), current_date + 60
from class_groups g;
insert into class_sessions (academy_id, group_id, schedule_id, starts_at, ends_at, room_id, teacher_id, capacity)
select g.academy_id, g.id, (select id from class_schedules), now() + interval '20 minutes', now() + interval '80 minutes',
       (select id from rooms where name = 'Sala 1'), g.teacher_id, 10
from class_groups g;
-- Otra clase lejos de la ventana.
insert into class_sessions (academy_id, group_id, starts_at, ends_at, room_id, teacher_id, capacity)
select g.academy_id, g.id, now() + interval '5 hours', now() + interval '6 hours', (select id from rooms where name = 'Sala 1'), g.teacher_id, 10
from class_groups g;

-- Cuotas: Vale al día, Sofi en gracia (debe desde hace 3 días), Lu suspendida (desde hace 10).
insert into memberships (academy_id, student_id, plan_id, teacher_id, age_category_id, anchor_day)
select s.academy_id, s.id, (select id from plans where name = 'Cuota de profe'), g.teacher_id, g.age_category_id, 1
from students s, class_groups g where s.first_name in ('Valentina', 'Sofía', 'Lucía');
insert into enrollments (academy_id, membership_id, student_id, schedule_id, starts_on)
select m.academy_id, m.id, m.student_id, (select id from class_schedules), current_date - 30 from memberships m;
insert into charges (academy_id, student_id, concept, membership_id, period_start, period_end, due_date, description, amount_cents)
select m.academy_id, m.student_id, 'membership', m.id, current_date - d, current_date - d + 29, current_date - d, 'Prueba', 5550000
from memberships m join students s on s.id = m.student_id
join (values ('Sofía', 3), ('Lucía', 10)) v(n, d) on v.n = s.first_name;

create temp table ids as
select (select id from students where first_name = 'Valentina') as vale,
       (select id from students where first_name = 'Sofía') as sofi,
       (select id from students where first_name = 'Lucía') as lu,
       (select id from students where first_name = 'Nicolás') as nico,
       (select id from students where first_name = 'Ana') as ana,
       (select id from class_sessions where schedule_id is not null) as clase;
grant select on ids to authenticated;

-- Un código como el que arma el celular (ventana actual, o la que se pida).
create function pg_temp.code(p_student uuid, p_offset int default 0) returns text language sql as $$
  select 'EDA1.' || p_student || '.' || (floor(extract(epoch from now()) / 30)::bigint + p_offset) || '.'
         || access_code_signature((select secret from student_access_keys where student_id = p_student), p_student,
                                  floor(extract(epoch from now()) / 30)::bigint + p_offset);
$$;
grant execute on function pg_temp.code(uuid, int) to authenticated;

-- 1. Cada alumno obtiene su clave (siempre la misma); nadie la lee directo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare k1 jsonb := my_access_key(); k2 jsonb := my_access_key();
begin
  assert k1 ->> 'student_id' = (select vale from ids)::text, 'es su ficha';
  assert length(k1 ->> 'secret') = 64 and k1 = k2, 'clave estable de 32 bytes';
  begin
    perform count(*) from student_access_keys;
    raise exception 'la tabla de claves no se lee directo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform check_in('EDA1.x.1.y');
    raise exception 'un alumno no registra ingresos';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  clave del QR';
end $$;
set local request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
select my_access_key();
set local request.jwt.claims = '{"sub":"b2000000-0000-0000-0000-00000000000b"}';
select my_access_key();
set local request.jwt.claims = '{"sub":"b4000000-0000-0000-0000-00000000000b"}';
select my_access_key();
reset role;
-- Preparamos los códigos como superusuario (la firma es interna).
create temp table codes as
select pg_temp.code(vale) as vale, pg_temp.code(vale, -10) as vale_viejo, pg_temp.code(sofi) as sofi,
       pg_temp.code(lu) as lu, pg_temp.code(ana) as ana from ids;
grant select on codes to authenticated;

-- 2. Recepción escanea: Vale tiene la clase fija y la cuota al día.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare r jsonb;
begin
  r := check_in((select vale from codes));
  assert r ->> 'result' = 'allowed' and r ->> 'reason' = 'fija', format('entra por su clase fija: %s', r);
  assert r ->> 'session_id' = (select clase from ids)::text, 'la clase de ahora';
  assert r ->> 'label' = 'Hip Hop · Adultos' and r ->> 'student_name' = 'Valentina', 'nombre y clase';
  assert (r ->> 'already')::boolean = false, 'primer ingreso';
  r := check_in((select vale from codes));
  assert (r ->> 'already')::boolean = true, 'segundo escaneo: ya estaba';
  assert (select count(*) from attendances where student_id = (select vale from ids)) = 1, 'una sola asistencia';
  raise notice 'OK  ingreso con clase fija';
end $$;

-- 3. QR falso o viejo.
do $$
declare r jsonb;
begin
  r := check_in(left((select vale from codes), -1) || 'x');
  assert r ->> 'result' = 'invalid' and r ->> 'reason' = 'qr-invalido', 'firma falsa';
  r := check_in('cualquier cosa');
  assert r ->> 'result' = 'invalid', 'texto cualquiera';
  r := check_in((select vale_viejo from codes));
  assert r ->> 'reason' = 'qr-vencido' and r ->> 'student_name' = 'Valentina', 'captura vieja';
  raise notice 'OK  QR falso o vencido';
end $$;

-- 4. Gracia, suspensión, reserva, sin clase y workshop.
do $$
declare r jsonb; v_w uuid;
begin
  r := check_in((select sofi from codes));
  assert r ->> 'result' = 'grace' and r ->> 'reason' = 'gracia', format('en gracia entra con aviso: %s', r);
  r := check_in((select lu from codes));
  assert r ->> 'result' = 'denied' and r ->> 'reason' = 'cuota-vencida', 'suspendida no entra';
  assert not exists (select 1 from attendances where student_id = (select lu from ids)), 'sin asistencia';
  r := check_in_student((select nico from ids));
  assert r ->> 'reason' = 'sin-clase', 'sin clase ahora';
  perform book_single_class((select clase from ids), (select nico from ids), 'cash', null);
  r := check_in_student((select nico from ids));
  assert r ->> 'result' = 'allowed' and r ->> 'reason' = 'reserva', 'con reserva entra';
  raise notice 'OK  gracia, suspensión, reserva y sin clase';
end $$;
reset role;
-- Ventana de ingreso: de 30 min antes a 15 min después del inicio (la clase empieza en 20 min).
do $$
begin
  assert evaluate_access((select academy_id from students where id = (select vale from ids)), (select vale from ids), now() - interval '15 minutes')
         ->> 'reason' = 'sin-clase', 'más de 30 min antes todavía no entra';
  assert evaluate_access((select academy_id from students where id = (select vale from ids)), (select vale from ids), now() + interval '34 minutes')
         ->> 'reason' = 'fija', 'hasta 15 min después del inicio entra';
  assert evaluate_access((select academy_id from students where id = (select vale from ids)), (select vale from ids), now() + interval '36 minutes')
         ->> 'reason' = 'sin-clase', 'más de 15 min después ya no entra';
  raise notice 'OK  ventana de ingreso';
end $$;
with w as (insert into workshops (academy_id, title, price_cents, capacity, status)
           select id, 'Heels intensivo', 2500000, 10, 'published' from academies returning id, academy_id)
insert into workshop_sessions (academy_id, workshop_id, starts_at, ends_at, room_id)
select academy_id, id, now() + interval '10 minutes', now() + interval '2 hours', (select id from rooms where name = 'Sala 2') from w;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare r jsonb;
begin
  perform enroll_workshop((select id from workshops limit 1), (select ana from ids), 'cash', null);
  r := check_in((select ana from codes));
  assert r ->> 'result' = 'allowed' and r ->> 'reason' = 'workshop' and r ->> 'label' = 'Workshop · Heels intensivo', 'workshop';
  assert exists (select 1 from attendances where student_id = (select ana from ids) and workshop_session_id is not null), 'asistencia al workshop';
  assert (select count(*) from access_logs) = 8, 'cada intento con alumno queda registrado';
  raise notice 'OK  workshop';
end $$;

-- 5. El profe escanea: sólo ve habilitado / no habilitado, sin deudas.
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
declare r jsonb;
begin
  r := check_in((select lu from codes));
  assert r ->> 'result' = 'denied' and r ->> 'reason' = 'no-habilitado', format('el profe no ve la deuda: %s', r);
  r := check_in((select sofi from codes));
  assert r ->> 'result' = 'allowed' and r ->> 'reason' = 'habilitado', 'la gracia el profe la ve como habilitado';
  begin
    perform check_in_student((select nico from ids));
    raise exception 'el profe no registra ingresos a mano por búsqueda';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from access_logs) = 0, 'el profe no ve el registro de ingresos';
  raise notice 'OK  el profe sólo ve habilitado';
end $$;

-- 6. Lista de la clase y asistencia a mano.
do $$
declare v_c uuid := (select clase from ids);
begin
  assert (select count(*) from session_roster(v_c)) = 4, 'tres fijas y una reserva';
  assert (select enabled from session_roster(v_c) where student_id = (select lu from ids)) = false, 'Lu no habilitada';
  assert (select present from session_roster(v_c) where student_id = (select vale from ids)), 'Vale presente';
  begin
    perform mark_attendance(v_c, (select lu from ids), true);
    raise exception 'no se marca a quien no está habilitado';
  exception when raise_exception then
    if sqlerrm not like 'No está habilitado%' then raise; end if;
  end;
  begin
    perform mark_attendance(v_c, (select ana from ids), true);
    raise exception 'no se marca a quien no está en la lista';
  exception when no_data_found then null;
  end;
  perform mark_attendance(v_c, (select vale from ids), false);
  assert not (select present from session_roster(v_c) where student_id = (select vale from ids)), 'desmarcada';
  perform mark_attendance(v_c, (select vale from ids), true);
  assert (select present from session_roster(v_c) where student_id = (select vale from ids)), 'marcada a mano';
  raise notice 'OK  lista y asistencia a mano';
end $$;

-- 7. Otro profe no ve la lista ni marca; la clase lejana no se marca todavía.
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('e1000000-0000-0000-0000-00000000000e', 'otro@example.com', '{"first_name":"Otro","academy":"extreme-dance"}');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select grant_role('e1000000-0000-0000-0000-00000000000e', 'teacher');
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-00000000000e"}';
do $$
begin
  assert (select count(*) from session_roster((select clase from ids))) = 0, 'no ve listas ajenas';
  begin
    perform mark_attendance((select clase from ids), (select sofi from ids), true);
    raise exception 'no marca en clases ajenas';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  listas ajenas protegidas';
end $$;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
begin
  perform mark_attendance((select id from class_sessions where schedule_id is null), (select sofi from ids), true);
  raise exception 'no se toma asistencia horas antes';
exception when invalid_parameter_value then
  raise notice 'OK  asistencia sólo cerca de la clase';
end $$;

-- 8. La alumna ve sólo su asistencia.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
begin
  assert (select count(*) from attendances) = 1, 'sólo la suya';
  raise notice 'OK  la alumna ve lo suyo';
end $$;

rollback;
