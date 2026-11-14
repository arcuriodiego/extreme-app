/**
 * Precio en efectivo (Diego, 28 oct): el precio que se carga es el de efectivo.
 * Con otros medios (transferencia, QR, tarjeta, la app) se suma un recargo
 * (regla non_cash_surcharge_tenths, en décimas de %). Mismo cálculo que la base (non_cash_price):
 * redondeado a los $100 más cercanos.
 */
export function nonCashPrice(cashCents: number, surchargePct: number): number {
  // En décimas de por ciento (8,5 % → 85), como la base: sin errores de coma flotante.
  // Redondeado a los $100 más cercanos (Diego, 14 nov). Sin recargo, el mismo precio.
  const tenths = Math.round(surchargePct * 10);
  if (tenths === 0) return cashCents;
  return Math.max(cashCents, Math.round((cashCents * (1000 + tenths)) / 10_000_000) * 10_000);
}

/** "8,5" o "21": el porcentaje como se escribe en Argentina. */
export function pctLabel(pct: number): string {
  return String(Math.round(pct * 10) / 10).replace(".", ",");
}

/** Los dos precios de algo que se cobra. `cash` es null si no hay precio distinto en efectivo. */
export interface PricePair {
  list: number;
  cash: number | null;
}

/**
 * Precio con otros medios de un plan (Diego, 14 nov): el cargado a mano si lo hay;
 * si no, efectivo + recargo. Misma lógica que la base (plan_price_pair_on).
 */
export function otherPrice(cashCents: number, surchargePct: number, explicitCents?: number | null): number {
  return explicitCents ?? nonCashPrice(cashCents, surchargePct);
}

export function pricePair(cashCents: number, surchargePct: number, explicitCents?: number | null): PricePair {
  const list = otherPrice(cashCents, surchargePct, explicitCents);
  return { list, cash: list > cashCents ? cashCents : null };
}

/** Lo que falta pagar de un cargo en efectivo: sólo si todavía no tiene pagos y su precio en efectivo es menor. */
export function cashDue(charge: { cashCents: number | null; paidCents: number; pendingCents: number }): number | null {
  if (charge.cashCents === null || charge.paidCents > 0) return null;
  return charge.cashCents < charge.pendingCents ? charge.cashCents : null;
}
