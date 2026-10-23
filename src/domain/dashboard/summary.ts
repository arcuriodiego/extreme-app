/** Cuentas y textos del panel de gestión. */

export const CONCEPT_LABELS: Record<string, string> = {
  membership: "Cuotas de profe",
  pack: "Packs",
  single_class: "Clases individuales",
  workshop: "Workshops",
  other: "Otros",
};

export type MembershipAlert = "grace" | "suspended" | "long_suspended" | "unpaid_first";

export const MEMBERSHIP_ALERT_LABELS: Record<MembershipAlert, string> = {
  long_suspended: "Decidir la baja",
  suspended: "Suspendida",
  grace: "En gracia",
  unpaid_first: "Falta el primer pago",
};

/** Variación porcentual redondeada; null si no hay con qué comparar. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Ocupación de una clase (fijos + reservas sobre el cupo), de 0 a 100. */
export function occupancy(fixed: number, booked: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round(((fixed + booked) / capacity) * 100));
}

/** Total del mes por concepto, de mayor a menor, con las devoluciones restadas aparte. */
export function monthRows(byConcept: Record<string, number>, refunds: number): { rows: { key: string; label: string; cents: number }[]; net: number } {
  const rows = Object.entries(byConcept)
    .filter(([, cents]) => cents > 0)
    .map(([key, cents]) => ({ key, label: CONCEPT_LABELS[key] ?? key, cents }))
    .sort((a, b) => b.cents - a.cents);
  const gross = rows.reduce((s, r) => s + r.cents, 0);
  return { rows, net: gross - refunds };
}
