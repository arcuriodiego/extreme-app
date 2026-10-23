-- =====================================================================
-- Migración 0013 · Workshops: sólo con el pago total
-- Decisión de Diego (23 oct): un workshop se reserva únicamente con el pago
-- total, sin excepción. Inscribir y cobrar pasan a ser un único paso:
-- si el pago no se registra, no hay inscripción ni cupo tomado.
-- =====================================================================

-- Inscribe a un alumno (o ficha de externo) y registra el pago total, todo junto.
create or replace function public.enroll_workshop(
  p_workshop_id uuid, p_student_id uuid, p_method text, p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_reg uuid;
  v_charge public.charges;
begin
  v_reg := public.register_workshop(p_workshop_id, p_student_id);
  select c.* into v_charge from public.charges c
   join public.workshop_registrations r on r.charge_id = c.id
   where r.id = v_reg;
  perform public.record_payment(v_academy, v_charge.id, v_charge.total_cents, p_method, p_reference);
  return v_reg;
end;
$$;

create or replace function public.enroll_workshop_guest(
  p_workshop_id uuid, p_first_name text, p_last_name text, p_phone text, p_dni text, p_method text, p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_reg uuid;
  v_charge public.charges;
begin
  v_reg := public.register_workshop_guest(p_workshop_id, p_first_name, p_last_name, p_phone, p_dni);
  select c.* into v_charge from public.charges c
   join public.workshop_registrations r on r.charge_id = c.id
   where r.id = v_reg;
  perform public.record_payment(v_academy, v_charge.id, v_charge.total_cents, p_method, p_reference);
  return v_reg;
end;
$$;

-- Las inscripciones sin pago ya no se pueden hacer desde la app.
revoke all on function public.register_workshop(uuid, uuid) from public, anon, authenticated;
revoke all on function public.register_workshop_guest(uuid, text, text, text, text) from public, anon, authenticated;

revoke all on function public.enroll_workshop(uuid, uuid, text, text) from public, anon;
revoke all on function public.enroll_workshop_guest(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.enroll_workshop(uuid, uuid, text, text) to authenticated;
grant execute on function public.enroll_workshop_guest(uuid, text, text, text, text, text, text) to authenticated;
