-- Ventana de ingreso definida por Diego (23 oct): para una clase de las 19:00,
-- el ingreso se registra de 18:30 a 19:15 (30 min antes, 15 min después del inicio).

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
    (p_academy_id, 'checkin_after_minutes', 15)
  on conflict (academy_id, key) do nothing;
$$;

update public.app_settings set value = 30 where key = 'checkin_before_minutes';
update public.app_settings set value = 15 where key = 'checkin_after_minutes';
