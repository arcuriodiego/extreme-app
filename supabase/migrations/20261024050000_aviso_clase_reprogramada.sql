-- Pedido de Diego (24 oct): si una clase suspendida se vuelve a programar, avisar.
-- - A los fijos de ese día: "Vuelve tu clase del …".
-- - A quienes la tenían reservada (la reserva se les devolvió al suspenderla): "Si querés ir, reservala de nuevo".
-- Además: cada suspensión o reprogramación genera su propio aviso (antes, una segunda
-- suspensión de la misma clase no avisaba porque el aviso ya existía).

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'due_soon', 'grace', 'suspended', 'pack_expiring', 'class_cancelled', 'class_restored', 'announcement'));

create or replace function public.notify_cancelled_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz    text := (select timezone from public.academies where id = new.academy_id);
  v_day   date := (new.starts_at at time zone v_tz)::date;
  v_when  text;
  v_label text := public.session_label(new.id);
  v_stamp text := (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  r record;
begin
  if new.starts_at <= now() then
    return null;
  end if;
  v_when := public.short_day(v_day) || ' a las ' || to_char(new.starts_at at time zone v_tz, 'HH24:MI');

  -- Se suspende.
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for r in
      select e.student_id, s.first_name, false as booked
      from public.enrollments e join public.students s on s.id = e.student_id
      where new.schedule_id is not null and e.schedule_id = new.schedule_id
        and e.starts_on <= v_day and (e.ends_on is null or e.ends_on > v_day)
      union
      select b.student_id, s.first_name, true
      from public.bookings b join public.students s on s.id = b.student_id
      where b.session_id = new.id and b.status = 'confirmed'
    loop
      perform public.notify_student(new.academy_id, r.student_id, 'class_cancelled',
        'Se suspendió tu clase del ' || v_when,
        'Se suspendió la clase de ' || r.first_name || ' del ' || v_when,
        v_label || '. Motivo: ' || coalesce(new.cancel_reason, 'sin motivo') ||
          case when r.booked then '. Te devolvimos la clase reservada.' else '.' end,
        v_label || '. Motivo: ' || coalesce(new.cancel_reason, 'sin motivo') ||
          case when r.booked then '. Le devolvimos la clase reservada.' else '.' end,
        '/clases', 'clase-suspendida:' || new.id || ':' || v_stamp);
    end loop;

  -- Vuelve a programarse.
  elsif new.status = 'scheduled' and old.status = 'cancelled' then
    for r in
      select e.student_id, s.first_name, false as booked
      from public.enrollments e join public.students s on s.id = e.student_id
      where new.schedule_id is not null and e.schedule_id = new.schedule_id
        and e.starts_on <= v_day and (e.ends_on is null or e.ends_on > v_day)
      union
      select b.student_id, s.first_name, true
      from public.bookings b join public.students s on s.id = b.student_id
      where b.session_id = new.id and b.status = 'cancelled' and b.refunded_unit
        and b.cancel_note = 'Clase suspendida por la academia'
        and not exists (select 1 from public.bookings b2 where b2.session_id = new.id
                        and b2.student_id = b.student_id and b2.status = 'confirmed')
    loop
      perform public.notify_student(new.academy_id, r.student_id, 'class_restored',
        'Vuelve tu clase del ' || v_when,
        'Vuelve la clase de ' || r.first_name || ' del ' || v_when,
        v_label || case when r.booked
          then '. La clase se dicta. Tu reserva se había devuelto: si querés ir, reservala de nuevo desde Clases.'
          else '. La clase se dicta normalmente.' end,
        v_label || case when r.booked
          then '. La clase se dicta. Su reserva se había devuelto: si va a ir, hay que reservarla de nuevo.'
          else '. La clase se dicta normalmente.' end,
        '/clases', 'clase-repuesta:' || new.id || ':' || v_stamp);
    end loop;
  end if;
  return null;
end;
$$;
