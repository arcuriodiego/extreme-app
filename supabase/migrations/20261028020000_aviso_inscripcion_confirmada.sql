-- =====================================================================
-- Aviso a la familia cuando se confirma la inscripción (Diego, 28 oct).
-- Al pasar una inscripción de pendiente a confirmada (al darle la cuota, o
-- "Ya está resuelta" en Gestión) le llega al alumno con cuenta y a sus
-- tutores: en la campanita, por email y al celular.
-- =====================================================================

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'due_soon', 'grace', 'suspended', 'pack_expiring', 'class_cancelled', 'class_restored', 'announcement', 'waitlist_offer',
  'signup_new', 'signup_confirmed'));

create or replace function public.notify_signup_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  select first_name into v_name from public.students where id = new.student_id;
  perform public.notify_student(
    new.academy_id, new.student_id, 'signup_confirmed',
    '¡Listo! Tu inscripción está confirmada',
    format('¡Listo! La inscripción de %s está confirmada', coalesce(v_name, 'tu hijo/a')),
    'Ya podés venir a clases. Tus horarios y tu pase QR están en la app.',
    format('%s ya puede venir a clases. Sus horarios y su pase QR están en la app.', coalesce(v_name, 'Tu hijo/a')),
    '/inicio',
    'inscripcion-confirmada:' || new.id);
  return null;
end;
$$;

create trigger signup_requests_notify_confirmed after update of status on public.signup_requests
  for each row when (old.status = 'pending' and new.status = 'confirmed')
  execute function public.notify_signup_confirmed();
