-- =====================================================================
-- Aviso a recepción y administración cuando llega una inscripción desde la
-- app (pedido de Diego, 26 oct). Llega a la campana (y por email) de cada
-- persona con permiso people.manage, salvo a quien la envió.
-- =====================================================================

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'due_soon', 'grace', 'suspended', 'pack_expiring', 'class_cancelled', 'class_restored', 'announcement', 'waitlist_offer',
  'signup_new'));

create or replace function public.notify_signup_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student text;
  v_by      text;
  v_slots   text;
  v_rel     text;
begin
  select trim(first_name || ' ' || last_name) into v_student from public.students where id = new.student_id;

  -- Quién la envió, si no es el propio alumno (madre, padre o tutor).
  if not exists (select 1 from public.students where id = new.student_id and profile_id = new.requested_by) then
    select trim(p.first_name || ' ' || p.last_name), gs.relationship into v_by, v_rel
      from public.profiles p
      left join public.guardians g on g.profile_id = p.id
      left join public.guardian_students gs on gs.guardian_id = g.id and gs.student_id = new.student_id
     where p.id = new.requested_by;
  end if;

  select string_agg(
           format('%s %s (%s · %s)',
                  (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[s.weekday],
                  to_char(s.start_time, 'HH24:MI'), st.name, ac.name),
           ', ' order by s.weekday, s.start_time)
    into v_slots
    from public.class_schedules s
    join public.class_groups g on g.id = s.group_id
    join public.dance_styles st on st.id = g.style_id
    join public.age_categories ac on ac.id = g.age_category_id
   where s.id = any (new.schedule_ids);

  insert into public.notifications (academy_id, recipient_id, student_id, kind, title, body, link, dedupe_key)
  select distinct new.academy_id, ur.profile_id, new.student_id, 'signup_new',
         left(format('Nueva inscripción: %s', coalesce(nullif(v_student, ''), 'alumno')), 140),
         left(concat_ws(' ',
                case when v_by is not null and v_by <> ''
                     then format('La envió %s%s.', v_by, case when v_rel is not null then format(' (%s)', v_rel) else '' end) end,
                case when v_slots is not null then format('Pidió: %s.', v_slots) end,
                'Revisala en Gestión → Inscripciones.'), 1000),
         '/admin/inscripciones',
         'signup_new:' || new.id
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.permission_code = 'people.manage'
   where ur.academy_id = new.academy_id
     and ur.profile_id <> new.requested_by
  on conflict (recipient_id, dedupe_key) do nothing;
  return null;
end;
$$;

create trigger signup_requests_notify after insert on public.signup_requests
  for each row execute function public.notify_signup_new();
