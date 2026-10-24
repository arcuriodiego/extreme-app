-- "Llegando ahora" (pedido de Diego, 24 oct): en el escáner de recepción, la lista de los
-- alumnos de las clases que están en su ventana de ingreso, con el estado de cada uno,
-- para registrar el ingreso con un toque (chicos que llegan sin celular).
--
-- Estado por alumno: 'reserva' (reserva confirmada), o el de su cuota fija:
-- 'current' (al día), 'grace' (en gracia), 'suspended' (vencida), 'unpaid_first' (sin primer pago).

create or replace function public.arrivals_now()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_tz      text;
  v_before  integer;
  v_after   integer;
begin
  if v_academy is null or not public.has_permission('attendance.mark') or not public.has_permission('people.view') then
    raise exception 'No tenés permiso para ver los ingresos.' using errcode = '42501';
  end if;
  select timezone into v_tz from public.academies where id = v_academy;
  v_before := coalesce(public.setting(v_academy, 'checkin_before_minutes'), 30);
  v_after  := coalesce(public.setting(v_academy, 'checkin_after_minutes'), 15);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'session_id', s.id, 'starts_at', s.starts_at, 'label', public.session_label(s.id), 'room', rm.name,
             'students', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'student_id', p.student_id,
                        'name', trim(st.first_name || ' ' || st.last_name),
                        'kind', p.kind, 'state', p.state,
                        'present', exists (select 1 from public.attendances a where a.session_id = s.id and a.student_id = p.student_id))
                      order by st.first_name, st.last_name)
               from (
                 select e.student_id, 'fija'::text as kind,
                        public.membership_state(e.membership_id, (s.starts_at at time zone v_tz)::date) as state
                 from public.enrollments e
                 where s.schedule_id is not null and e.schedule_id = s.schedule_id
                   and e.starts_on <= (s.starts_at at time zone v_tz)::date
                   and (e.ends_on is null or e.ends_on > (s.starts_at at time zone v_tz)::date)
                 union all
                 select b.student_id, 'reserva', 'reserva'
                 from public.bookings b where b.session_id = s.id and b.status = 'confirmed'
               ) p
               join public.students st on st.id = p.student_id
             ), '[]'::jsonb))
           order by s.starts_at)
    from public.class_sessions s
    join public.rooms rm on rm.id = s.room_id
    where s.academy_id = v_academy and s.status = 'scheduled'
      and s.starts_at between now() - make_interval(mins => v_after) and now() + make_interval(mins => v_before)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.arrivals_now() from public, anon;
grant execute on function public.arrivals_now() to authenticated;
