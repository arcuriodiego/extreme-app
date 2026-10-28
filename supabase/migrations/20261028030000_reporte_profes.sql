-- =====================================================================
-- Reporte de asistencia por profe (para liquidar sueldos; sólo administración).
-- Una fila por clase del mes (en la hora de la academia) con quién la dio:
-- el reemplazo si hubo, si no el profe de la clase o del grupo.
-- =====================================================================

create or replace function public.teacher_report(p_month date)
returns table (
  session_id      uuid,
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          text,
  cancel_reason   text,
  group_name      text,
  owner_id        uuid,     -- profe titular de esa clase
  owner_name      text,
  taught_by_id    uuid,     -- quien la dio (reemplazo o titular)
  taught_by_name  text,
  present         integer
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
begin
  if v_academy is null or not public.has_permission('finance.view') then
    raise exception 'Sólo administración ve el reporte de profes.' using errcode = '42501';
  end if;
  select timezone into v_tz from public.academies where id = v_academy;
  v_from := (date_trunc('month', p_month)::date::timestamp) at time zone v_tz;
  v_to := ((date_trunc('month', p_month) + interval '1 month')::date::timestamp) at time zone v_tz;

  return query
  select s.id, s.starts_at, s.ends_at, s.status, s.cancel_reason,
         concat_ws(' · ', st.name, ac.name, lv.name),
         coalesce(s.teacher_id, g.teacher_id), ot.display_name,
         coalesce(s.substitute_teacher_id, s.teacher_id, g.teacher_id), tt.display_name,
         (select count(*)::integer from public.attendances a where a.session_id = s.id)
  from public.class_sessions s
  join public.class_groups g on g.id = s.group_id
  join public.dance_styles st on st.id = g.style_id
  join public.age_categories ac on ac.id = g.age_category_id
  left join public.levels lv on lv.id = g.level_id
  left join public.teachers ot on ot.id = coalesce(s.teacher_id, g.teacher_id)
  left join public.teachers tt on tt.id = coalesce(s.substitute_teacher_id, s.teacher_id, g.teacher_id)
  where s.academy_id = v_academy and s.starts_at >= v_from and s.starts_at < v_to
  order by s.starts_at;
end;
$$;

revoke all on function public.teacher_report(date) from public, anon;
grant execute on function public.teacher_report(date) to authenticated;
