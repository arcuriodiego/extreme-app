/**
 * Pagos registrados en recepción: medios, totales de caja y validación del formulario.
 * El control definitivo (permisos, no pagar de más) lo hace la base.
 */
import type { Cents } from "../shared/money.ts";
import { parsePesos } from "./prices.ts";

export type PaymentMethod = "cash" | "transfer" | "qr" | "card_pos" | "mp_checkout" | "mp_subscription" | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  qr: "QR (cualquier billetera)",
  card_pos: "Tarjeta (posnet)",
  mp_checkout: "Mercado Pago",
  mp_subscription: "Débito automático",
  other: "Otro",
};

/** Medios que recepción puede registrar a mano. */
export const COUNTER_METHODS: readonly PaymentMethod[] = ["cash", "transfer", "qr", "card_pos", "other"];

export function isCounterMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (COUNTER_METHODS as readonly string[]).includes(value);
}

export function methodLabel(method: string): string {
  return method in PAYMENT_METHOD_LABELS ? PAYMENT_METHOD_LABELS[method as PaymentMethod] : method;
}

/** Valida un cobro: importe en pesos, positivo y no mayor a lo pendiente; medio válido. */
export function validatePaymentForm(
  input: { amount: unknown; method: unknown; reference: unknown },
  pendingCents: Cents,
): { ok: true; value: { amountCents: Cents; method: PaymentMethod; reference: string | null } } | { ok: false; error: "monto" | "monto-mayor" | "medio" } {
  const amount = parsePesos(input.amount);
  if (amount === null) return { ok: false, error: "monto" };
  if (amount > pendingCents) return { ok: false, error: "monto-mayor" };
  if (!isCounterMethod(input.method)) return { ok: false, error: "medio" };
  const reference = typeof input.reference === "string" ? input.reference.trim().slice(0, 80) : "";
  return { ok: true, value: { amountCents: amount, method: input.method, reference: reference || null } };
}

export interface PaymentLike {
  method: string;
  amountCents: Cents;
  status: "approved" | "void";
}

/** Totales de caja por medio (sin los anulados), ordenados de mayor a menor. */
export function cashSummary(payments: readonly PaymentLike[]): { total: Cents; byMethod: { method: string; label: string; cents: Cents; count: number }[] } {
  const map = new Map<string, { cents: Cents; count: number }>();
  for (const p of payments) {
    if (p.status !== "approved") continue;
    const cur = map.get(p.method) ?? { cents: 0, count: 0 };
    map.set(p.method, { cents: cur.cents + p.amountCents, count: cur.count + 1 });
  }
  const byMethod = [...map.entries()]
    .map(([method, v]) => ({ method, label: methodLabel(method), ...v }))
    .sort((a, b) => b.cents - a.cents);
  return { total: byMethod.reduce((s, m) => s + m.cents, 0), byMethod };
}

/** "10/10 al 9/11" a partir de fechas AAAA-MM-DD. */
export function periodLabel(start: string, end: string): string {
  const f = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
  return `${f(start)} al ${f(end)}`;
}
