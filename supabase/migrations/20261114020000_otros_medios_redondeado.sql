-- =====================================================================
-- Precio con otros medios redondeado a los $100 más cercanos (Diego, 14 nov):
-- con 8,5 %, $59.000 → $64.000, $12.600 → $13.700, $69.500 → $75.400 y
-- $108.000 → $117.200. Sin recargo, el mismo precio (nunca menos que el de efectivo).
-- Lo ya emitido o cobrado no cambia: los cargos guardan los dos precios.
-- =====================================================================

create or replace function public.non_cash_price(p_academy_id uuid, p_cash_cents bigint)
returns bigint
language sql
stable
as $$
  select case
    when coalesce(public.setting(p_academy_id, 'non_cash_surcharge_tenths'), 0) = 0 then p_cash_cents
    else greatest(p_cash_cents,
                  (round(p_cash_cents * (1000 + public.setting(p_academy_id, 'non_cash_surcharge_tenths')) / 10000000.0) * 10000)::bigint)
  end;
$$;
