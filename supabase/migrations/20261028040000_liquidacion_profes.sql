-- =====================================================================
-- Liquidación de profes (Diego, 28 oct): cada profe cobra un porcentaje
-- (regla teacher_share_pct, 50 %) de lo que corresponde a sus clases.
-- Siempre sobre el precio en efectivo. Workshops no entran.
--
-- - Cuota de profe: el % del precio de cada cuota pagada en el mes (por la
--   fecha del pago), al profe de esa cuota.
-- - Pack (10 o 16): por cada clase reservada con el pack en una clase del mes
--   que ya empezó (aunque el alumno falte), el % de (precio del pack / clases
--   del pack), al profe que dio la clase (el reemplazo, si hubo).
-- - Clase individual: el % de su precio, al profe que dio la clase.
-- - Crédito por cancelación: como la clase individual de origen.
-- Las reservas devueltas (clase suspendida o cancelación a tiempo) no cuentan.
-- =====================================================================

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in (
  'grace_days', 'suspension_alert_days', 'due_reminder_days', 'cancel_hours', 'credit_days',
  'credit_class_window_days', 'booking_hold_minutes', 'session_generation_weeks',
  'checkin_before_minutes', 'checkin_after_minutes', 'workshop_offer_hours',
  'non_cash_surcharge_pct',
  'teacher_share_pct'  -- profes: porcentaje que cobra cada profe
));

create or replace function public.seed_default_settings(p_academy_id uuid)
returns void
language sql
as $$
  insert into public.app_settings (academy_id, key, value) values
    (p_academy_id, 'grace_days', 5),
    (p_academy_id, 'suspension_alert_days', 30),
    (p_academy_id, 'due_reminder_days', 3),
    (p_academy_id, 'cancel_hours', 12),
    (p_academy_id, 'credit_days', 5),
    (p_academy_id, 'credit_class_window_days', 14),
    (p_academy_id, 'booking_hold_minutes', 15),
    (p_academy_id, 'session_generation_weeks', 8),
    (p_academy_id, 'checkin_before_minutes', 30),
    (p_academy_id, 'checkin_after_minutes', 15),
    (p_academy_id, 'workshop_offer_hours', 24),
    (p_academy_id, 'non_cash_surcharge_pct', 21),
    (p_academy_id, 'teacher_share_pct', 50)
  on conflict (academy_id, key) do nothing;
$$;

select public.seed_default_settings(id) from public.academies;

create or replace function public.setting_bounds(p_key text)
returns int4range
language sql
immutable
as $$
  select case p_key
    when 'grace_days'               then int4range(0, 15, '[]')
    when 'suspension_alert_days'    then int4range(7, 120, '[]')
    when 'due_reminder_days'        then int4range(1, 10, '[]')
    when 'cancel_hours'             then int4range(0, 48, '[]')
    when 'credit_days'              then int4range(1, 30, '[]')
    when 'credit_class_window_days' then int4range(1, 60, '[]')
    when 'booking_hold_minutes'     then int4range(5, 60, '[]')
    when 'session_generation_weeks' then int4range(4, 12, '[]')
    when 'checkin_before_minutes'   then int4range(5, 120, '[]')
    when 'checkin_after_minutes'    then int4range(0, 60, '[]')
    when 'workshop_offer_hours'     then int4range(1, 72, '[]')
    when 'non_cash_surcharge_pct'   then int4range(0, 50, '[]')
    when 'teacher_share_pct'        then int4range(0, 100, '[]')
  end;
$$;

create or replace function public.teacher_payroll(p_month date)
returns table (
  teacher_id    uuid,
  teacher_name  text,
  concept       text,      -- 'cuota' | 'pack' | 'suelta' | 'credito'
  occurred_at   timestamptz,
  student_name  text,
  detail        text,
  base_cents    bigint,    -- precio en efectivo que corresponde a esa línea
  share_cents   bigint     -- lo que cobra el profe
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_pct integer;
begin
  if v_academy is null or not public.has_permission('finance.view') then
    raise exception 'Sólo administración ve la liquidación de profes.' using errcode = '42501';
  end if;
  select timezone into v_tz from public.academies where id = v_academy;
  v_from := (date_trunc('month', p_month)::date::timestamp) at time zone v_tz;
  v_to := ((date_trunc('month', p_month) + interval '1 month')::date::timestamp) at time zone v_tz;
  v_pct := coalesce(public.setting(v_academy, 'teacher_share_pct'), 50);

  return query
  with lines as (
    -- Cuotas pagadas en el mes (fecha del último pago vigente del cargo).
    select m.teacher_id as t_id, 'cuota'::text as kind, pay.paid_at as when_at,
           c.student_id as s_id, c.description as what,
           coalesce(c.cash_amount_cents, c.amount_cents) as base
    from public.charges c
    join public.memberships m on m.id = c.membership_id
    join lateral (
      select max(p.paid_at) as paid_at
      from public.payment_allocations a join public.payments p on p.id = a.payment_id and p.status = 'approved'
      where a.charge_id = c.id
    ) pay on true
    where c.academy_id = v_academy and c.concept = 'membership' and c.status = 'paid'
      and pay.paid_at >= v_from and pay.paid_at < v_to

    union all
    -- Reservas en clases del mes que ya empezaron.
    select coalesce(s.substitute_teacher_id, s.teacher_id, g.teacher_id), b.pay_kind, s.starts_at,
           b.student_id, concat_ws(' · ', st.name, ac.name, lv.name),
           case b.pay_kind
             when 'pack' then (select coalesce(pc.cash_amount_cents, pc.amount_cents) / greatest(bal.units_total, 1)
                                 from public.class_balances bal left join public.charges pc on pc.id = bal.charge_id
                                where bal.id = b.balance_id)
             when 'single' then (select coalesce(sc.cash_amount_cents, sc.amount_cents) from public.charges sc where sc.id = b.charge_id)
             when 'credit' then coalesce(
               (select coalesce(oc.cash_amount_cents, oc.amount_cents)
                  from public.class_balances cb
                  join public.bookings ob on ob.id = cb.origin_booking_id
                  join public.charges oc on oc.id = ob.charge_id
                 where cb.id = b.balance_id),
               public.plan_price_on((select id from public.plans where academy_id = v_academy and kind = 'single_class' and active order by sort_order limit 1),
                                    (s.starts_at at time zone v_tz)::date))
           end
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    join public.class_groups g on g.id = s.group_id
    join public.dance_styles st on st.id = g.style_id
    join public.age_categories ac on ac.id = g.age_category_id
    left join public.levels lv on lv.id = g.level_id
    where b.academy_id = v_academy and b.status = 'confirmed' and s.status <> 'cancelled'
      and s.starts_at >= v_from and s.starts_at < v_to and s.starts_at <= now()
  )
  select l.t_id, t.display_name,
         case l.kind when 'single' then 'suelta' when 'credit' then 'credito' else l.kind end,
         l.when_at, trim(st.first_name || ' ' || st.last_name), l.what,
         coalesce(l.base, 0)::bigint, (round(coalesce(l.base, 0) * v_pct / 100.0 / 100) * 100)::bigint
  from lines l
  left join public.teachers t on t.id = l.t_id
  join public.students st on st.id = l.s_id
  where l.t_id is not null
  order by t.display_name, l.when_at;
end;
$$;

revoke all on function public.teacher_payroll(date) from public, anon;
grant execute on function public.teacher_payroll(date) to authenticated;
