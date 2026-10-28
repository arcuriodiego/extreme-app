-- =====================================================================
-- Modalidad de cobro de cada profe (Diego, 28 oct): algunos cobran por
-- quincena (1 al 15 y 16 a fin de mes) y otros el mes completo.
-- La liquidación devuelve la modalidad; la pantalla separa las quincenas.
-- =====================================================================

alter table public.teachers
  add column pay_period text not null default 'month' check (pay_period in ('month', 'fortnight'));
grant update (pay_period) on public.teachers to authenticated;

-- Cambia el tipo de resultado: se reemplaza la función.
drop function public.teacher_payroll(date);

create or replace function public.teacher_payroll(p_month date)
returns table (
  teacher_id    uuid,
  teacher_name  text,
  pay_period    text,      -- 'month' | 'fortnight'
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
  select l.t_id, t.display_name, t.pay_period,
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
