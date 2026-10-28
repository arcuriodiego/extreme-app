/**
 * Precio en efectivo (Diego, 28 oct): el precio que se carga es el de efectivo.
 * Con otros medios (transferencia, QR, tarjeta, la app) se suma un recargo
 * (regla non_cash_surcharge_pct). Mismo cálculo que la base (non_cash_price):
 * redondeado a pesos enteros.
 */
export function nonCashPrice(cashCents: number, surchargePct: number): number {
  return Math.round((cashCents * (100 + surchargePct)) / 10000) * 100;
}

/** Los dos precios de algo que se cobra. `cash` es null si no hay precio distinto en efectivo. */
export interface PricePair {
  list: number;
  cash: number | null;
}

export function pricePair(cashCents: number, surchargePct: number): PricePair {
  const list = nonCashPrice(cashCents, surchargePct);
  return { list, cash: list > cashCents ? cashCents : null };
}

/** Lo que falta pagar de un cargo en efectivo: sólo si todavía no tiene pagos y su precio en efectivo es menor. */
export function cashDue(charge: { cashCents: number | null; paidCents: number; pendingCents: number }): number | null {
  if (charge.cashCents === null || charge.paidCents > 0) return null;
  return charge.cashCents < charge.pendingCents ? charge.cashCents : null;
}
