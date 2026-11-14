-- =====================================================================
-- Recargo con un decimal (Diego, 14 nov): un único porcentaje para otros
-- medios de pago, 8,5 %, sobre los precios en efectivo de enero 2027
-- ($59.000, $12.600, $69.500 y $108.000).
--
-- La regla non_cash_surcharge_pct (entero) pasa a non_cash_surcharge_tenths:
-- décimas de por ciento (85 = 8,5 %), de 0 a 500 (0 a 50 %).
-- Lo ya emitido o cobrado no cambia: los cargos guardan los dos precios.
-- =====================================================================

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in (
  'grace_days', 'suspension_alert_days', 'due_reminder_days', 'cancel_hours', 'credit_days',
  'credit_class_window_days', 'booking_hold_minutes', 'session_generation_weeks',
  'checkin_before_minutes', 'checkin_after_minutes', 'workshop_offer_hours',
  'non_cash_surcharge_pct',      -- (se borra en esta migración)
  'non_cash_surcharge_tenths',   -- precios: recargo para otros medios, en décimas de % (85 = 8,5 %)
  'teacher_share_pct'
));

create or replace function public.setting_bounds(p_key text)
returns int4range
language sql
immutable
as $$
  select case p_key
    when 'grace_days'                then int4range(0, 15, '[]')
    when 'suspension_alert_days'     then int4range(7, 120, '[]')
    when 'due_reminder_days'         then int4range(1, 10, '[]')
    when 'cancel_hours'              then int4range(0, 48, '[]')
    when 'credit_days'               then int4range(1, 30, '[]')
    when 'credit_class_window_days'  then int4range(1, 60, '[]')
    when 'booking_hold_minutes'      then int4range(5, 60, '[]')
    when 'session_generation_weeks'  then int4range(4, 12, '[]')
    when 'checkin_before_minutes'    then int4range(5, 120, '[]')
    when 'checkin_after_minutes'     then int4range(0, 60, '[]')
    when 'workshop_offer_hours'      then int4range(1, 72, '[]')
    when 'non_cash_surcharge_tenths' then int4range(0, 500, '[]')
    when 'teacher_share_pct'         then int4range(0, 100, '[]')
  end;
$$;

-- 8,5 % para todas las academias (hoy, sólo Extreme Dance).
insert into public.app_settings (academy_id, key, value)
select id, 'non_cash_surcharge_tenths', 85 from public.academies
on conflict (academy_id, key) do update set value = excluded.value;
delete from public.app_settings where key = 'non_cash_surcharge_pct';

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in (
  'grace_days', 'suspension_alert_days', 'due_reminder_days', 'cancel_hours', 'credit_days',
  'credit_class_window_days', 'booking_hold_minutes', 'session_generation_weeks',
  'checkin_before_minutes', 'checkin_after_minutes', 'workshop_offer_hours',
  'non_cash_surcharge_tenths',   -- precios: recargo para otros medios, en décimas de % (85 = 8,5 %)
  'teacher_share_pct'            -- profes: porcentaje que cobra cada profe
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
    (p_academy_id, 'non_cash_surcharge_tenths', 85),
    (p_academy_id, 'teacher_share_pct', 50)
  on conflict (academy_id, key) do nothing;
$$;

-- Precio con otros medios: efectivo + recargo, redondeado a pesos enteros.
create or replace function public.non_cash_price(p_academy_id uuid, p_cash_cents bigint)
returns bigint
language sql
stable
as $$
  select (round(p_cash_cents * (1000 + coalesce(public.setting(p_academy_id, 'non_cash_surcharge_tenths'), 0)) / 100000.0) * 100)::bigint;
$$;
