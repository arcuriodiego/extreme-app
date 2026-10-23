-- Entrega 13 · Panel de gestión con datos reales.
--
-- Una sola función arma el resumen del día y del mes (una consulta, rápida):
-- - Clases de hoy: ocupación (fijos + reservas de cupo) y presentes.
-- - Ingresos con QR de hoy.
-- - Alumnos activos (cuota activa o pack/crédito vigente).
-- - Atención: cuotas en gracia, suspendidas, suspendidas hace mucho (decidir la baja),
--   que vencen pronto, sin primer pago; packs que vencen pronto con clases sin usar.
-- - Plata: caja de hoy (quien cobra) e ingresos del mes por concepto y medio,
--   comparados con el mismo tramo del mes anterior (sólo administración).

create or replace function public.dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_academy    uuid := public.current_academy_id();
  v_tz         text;
  v_today      date;
  v_day_start  timestamptz;
  v_day_end    timestamptz;
  v_month      date;
  v_prev_month date;
  v_prev_to    timestamptz;
  v_grace      integer;
  v_alert      integer;
  v_soon       integer;
  v_cash       boolean := public.has_permission('payments.register') or public.has_permission('finance.view');
  v_finance    boolean := public.has_permission('finance.view');
  v_result     jsonb;
begin
  if v_academy is null or not public.has_permission('people.view') then
    raise exception 'No tenés permiso para ver el panel.' using errcode = '42501';
  end if;

  select timezone into v_tz from public.academies where id = v_academy;
  v_today      := public.academy_today(v_academy);
  v_day_start  := v_today::timestamp at time zone v_tz;
  v_day_end    := (v_today + 1)::timestamp at time zone v_tz;
  v_month      := date_trunc('month', v_today)::date;
  v_prev_month := (v_month - interval '1 month')::date;
  -- Mismo tramo del mes anterior: del 1 hasta el mismo día (o el último, si ese mes es más corto).
  v_prev_to    := (least(v_prev_month + (v_today - v_month) + 1, v_month))::timestamp at time zone v_tz;
  v_grace      := coalesce(public.setting(v_academy, 'grace_days'), 5);
  v_alert      := coalesce(public.setting(v_academy, 'suspension_alert_days'), 30);
  v_soon       := coalesce(public.setting(v_academy, 'due_reminder_days'), 3);

  -- Clases de hoy
  v_result := jsonb_build_object('today', v_today, 'classes', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status,
             'label', public.session_label(s.id),
             'teacher', coalesce(sub.display_name, t.display_name),
             'substitute', sub.id is not null,
             'room', rm.name,
             'capacity', s.capacity, 'fixed', a.fixed, 'booked', a.booked,
             'present', (select count(*) from public.attendances att where att.session_id = s.id))
           order by s.starts_at)
    from public.class_sessions s
    join public.rooms rm on rm.id = s.room_id
    left join public.teachers t on t.id = s.teacher_id
    left join public.teachers sub on sub.id = s.substitute_teacher_id
    cross join lateral public.session_availability(array[s.id]) a
    where s.academy_id = v_academy and s.starts_at >= v_day_start and s.starts_at < v_day_end
  ), '[]'::jsonb));

  -- Ingresos con QR (o a mano) de hoy
  v_result := v_result || jsonb_build_object('entries', (
    select jsonb_build_object(
             'allowed', count(*) filter (where result in ('allowed', 'grace')),
             'denied',  count(*) filter (where result = 'denied'))
    from public.access_logs
    where academy_id = v_academy and created_at >= v_day_start and created_at < v_day_end
  ));

  -- Alumnos activos
  v_result := v_result || jsonb_build_object('active_students', (
    select count(distinct student_id) from (
      select m.student_id from public.memberships m where m.academy_id = v_academy and m.status = 'active'
      union
      select b.student_id from public.class_balances b
      where b.academy_id = v_academy and b.valid_until > now() and public.balance_remaining(b.id) > 0
    ) x
  ));

  -- Cuotas: estado de cada cuota activa
  with m as (
    select m.id, m.student_id, m.anchor_day,
           trim(st.first_name || ' ' || st.last_name) as name,
           (select min(c.due_date) from public.charges c
             where c.membership_id = m.id and c.status in ('open', 'partially_paid') and c.due_date < v_today) as oldest,
           (select coalesce(sum(c.total_cents - c.paid_cents), 0) from public.charges c
             where c.membership_id = m.id and c.status in ('open', 'partially_paid') and c.due_date < v_today) as owed
    from public.memberships m
    join public.students st on st.id = m.student_id
    where m.academy_id = v_academy and m.status = 'active'
  ), classified as (
    select m.*,
           case
             when m.anchor_day is null then 'unpaid_first'
             when m.oldest is null then 'current'
             when v_today <= m.oldest + v_grace then 'grace'
             when v_today - (m.oldest + v_grace) > v_alert then 'long_suspended'
             else 'suspended'
           end as state
    from m
  )
  select v_result || jsonb_build_object('memberships', jsonb_build_object(
           'grace',          (select count(*) from classified where state = 'grace'),
           'suspended',      (select count(*) from classified where state in ('suspended', 'long_suspended')),
           'long_suspended', (select count(*) from classified where state = 'long_suspended'),
           'unpaid_first',   (select count(*) from classified where state = 'unpaid_first'),
           'owed_cents',     case when v_cash then (select coalesce(sum(owed), 0) from classified) end,
           'list', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'student_id', student_id, 'name', name, 'state', state,
                      'since', case when state in ('suspended', 'long_suspended') then oldest + v_grace + 1 else oldest end,
                      'owed_cents', case when v_cash then owed end)
                    order by case state when 'long_suspended' then 0 when 'suspended' then 1 when 'grace' then 2 else 3 end, oldest nulls last, name)
             from (select * from classified where state <> 'current'
                   order by case state when 'long_suspended' then 0 when 'suspended' then 1 when 'grace' then 2 else 3 end, oldest nulls last
                   limit 12) l
           ), '[]'::jsonb)))
    into v_result
  from (select 1) one;

  -- Lo que vence pronto: cuotas de los próximos días y packs con clases sin usar
  v_result := v_result || jsonb_build_object('due_soon', coalesce((
    select jsonb_agg(x order by x ->> 'date', x ->> 'name') from (
      select jsonb_build_object('kind', 'cuota', 'student_id', c.student_id,
                                'name', trim(st.first_name || ' ' || st.last_name), 'date', c.due_date,
                                'amount_cents', case when v_cash then c.total_cents - c.paid_cents end) as x
      from public.charges c join public.students st on st.id = c.student_id
      where c.academy_id = v_academy and c.concept = 'membership' and c.status in ('open', 'partially_paid')
        and c.due_date between v_today and v_today + v_soon
      union all
      select jsonb_build_object('kind', 'pack', 'student_id', b.student_id,
                                'name', trim(st.first_name || ' ' || st.last_name),
                                'date', ((b.valid_until at time zone v_tz)::date - 1),
                                'remaining', public.balance_remaining(b.id))
      from public.class_balances b join public.students st on st.id = b.student_id
      where b.academy_id = v_academy and b.kind = 'pack'
        and b.valid_until > now() and b.valid_until <= (v_today + v_soon + 1)::timestamp at time zone v_tz
        and public.balance_remaining(b.id) > 0
    ) q
  ), '[]'::jsonb));

  -- Caja de hoy
  if v_cash then
    v_result := v_result || jsonb_build_object('cash_today', (
      (select coalesce(sum(amount_cents), 0) from public.payments
        where academy_id = v_academy and status = 'approved' and paid_at >= v_day_start and paid_at < v_day_end)
      - (select coalesce(sum(amount_cents), 0) from public.refunds
          where academy_id = v_academy and refunded_at >= v_day_start and refunded_at < v_day_end)
    ));
  end if;

  -- Ingresos del mes (sólo administración)
  if v_finance then
    v_result := v_result || jsonb_build_object('month', jsonb_build_object(
      'from', v_month,
      'by_concept', coalesce((
        select jsonb_object_agg(concept, cents) from (
          select c.concept, sum(al.amount_cents) as cents
          from public.payments p
          join public.payment_allocations al on al.payment_id = p.id
          join public.charges c on c.id = al.charge_id
          where p.academy_id = v_academy and p.status = 'approved'
            and p.paid_at >= v_month::timestamp at time zone v_tz and p.paid_at < v_day_end
          group by c.concept
        ) x), '{}'::jsonb),
      'by_method', coalesce((
        select jsonb_object_agg(method, cents) from (
          select p.method, sum(p.amount_cents) as cents
          from public.payments p
          where p.academy_id = v_academy and p.status = 'approved'
            and p.paid_at >= v_month::timestamp at time zone v_tz and p.paid_at < v_day_end
          group by p.method
        ) x), '{}'::jsonb),
      'refunds', (select coalesce(sum(amount_cents), 0) from public.refunds
                   where academy_id = v_academy
                     and refunded_at >= v_month::timestamp at time zone v_tz and refunded_at < v_day_end),
      'previous', (
        (select coalesce(sum(amount_cents), 0) from public.payments
          where academy_id = v_academy and status = 'approved'
            and paid_at >= v_prev_month::timestamp at time zone v_tz and paid_at < v_prev_to)
        - (select coalesce(sum(amount_cents), 0) from public.refunds
            where academy_id = v_academy
              and refunded_at >= v_prev_month::timestamp at time zone v_tz and refunded_at < v_prev_to))
    ));
  end if;

  return v_result;
end;
$$;

revoke all on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated;
