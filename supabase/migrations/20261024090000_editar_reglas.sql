-- Entrega 17 · Editar las reglas desde Configuración (sólo administración).
-- Cada regla tiene un rango permitido, que la base hace cumplir en cualquier cambio.
-- Los cambios quedan en la auditoría con su autor.

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
  end;
$$;

create or replace function public.app_settings_validate()
returns trigger
language plpgsql
as $$
declare v_range int4range := public.setting_bounds(new.key);
begin
  if v_range is not null and not (new.value <@ v_range) then
    raise exception 'El valor de % tiene que estar entre % y %.', new.key, lower(v_range), upper(v_range) - 1
      using errcode = '22023', hint = 'fuera-de-rango';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

create trigger app_settings_validate before insert or update on public.app_settings
  for each row execute function public.app_settings_validate();

-- Cambia varias reglas juntas (p_values = {"grace_days": 6, ...}). Valida también que
-- la clase del crédito pueda ser al menos hasta el último día para reservarla.
create or replace function public.update_settings(p_values jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_key text;
  v_value integer;
  v_count integer := 0;
begin
  if v_academy is null or not public.has_permission('settings.manage') then
    raise exception 'Sólo administración puede cambiar las reglas.' using errcode = '42501';
  end if;
  for v_key in select jsonb_object_keys(coalesce(p_values, '{}'::jsonb)) loop
    if public.setting_bounds(v_key) is null then
      raise exception 'Regla desconocida: %.', v_key using errcode = '22023';
    end if;
    begin
      v_value := (p_values ->> v_key)::integer;
    exception when others then
      raise exception 'El valor de % tiene que ser un número entero.', v_key using errcode = '22023';
    end;
    update public.app_settings set value = v_value
     where academy_id = v_academy and key = v_key and value is distinct from v_value;
    v_count := v_count + case when found then 1 else 0 end;
  end loop;
  if public.setting(v_academy, 'credit_class_window_days') < public.setting(v_academy, 'credit_days') then
    raise exception 'La clase del crédito tiene que poder ser al menos hasta el último día para reservarla.'
      using errcode = '22023', hint = 'credito';
  end if;
  return v_count;
end;
$$;

revoke all on function public.update_settings(jsonb) from public, anon;
grant execute on function public.update_settings(jsonb) to authenticated;
