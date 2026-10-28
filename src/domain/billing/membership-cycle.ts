/**
 * Ciclo de la cuota de profe y semáforo de acceso.
 *
 * Reglas aprobadas:
 * - El vencimiento queda anclado al día del primer pago (paga 10/10 → vence 10/11, 10/12…).
 * - Si el mes no tiene ese día, vence el último día del mes y vuelve al día original después.
 * - Pagar durante la gracia no corre el vencimiento.
 * - Gracia: 5 días corridos después del vencimiento (vence 10 → gracia 11 a 15 → suspensión desde el 16).
 * - Sólo el pago total del período restablece el acceso.
 */

import {
  type CalendarDate,
  addDays,
  addMonthsAnchored,
  dayOfMonth,
  diffDays,
} from "../shared/calendar-date.ts";

export const DEFAULT_GRACE_DAYS = 5;

export interface BillingPeriod {
  /** Número de período: 0 es el que cubre el primer pago. */
  index: number;
  /** Primer día cubierto (inclusive). */
  start: CalendarDate;
  /** Último día cubierto (inclusive). */
  end: CalendarDate;
  /** Día en que vence el período siguiente; coincide con el día después de `end`. */
  nextDueDate: CalendarDate;
}

/**
 * Período número `index` de una cuota cuyo primer pago fue `firstPaymentDate`.
 * El período 0 va del primer pago hasta el día anterior al primer vencimiento.
 */
export function billingPeriod(firstPaymentDate: CalendarDate, index: number): BillingPeriod {
  if (!Number.isInteger(index) || index < 0) throw new Error(`Período inválido: ${index}.`);
  const anchor = dayOfMonth(firstPaymentDate);
  const start = addMonthsAnchored(firstPaymentDate, index, anchor);
  const nextDueDate = addMonthsAnchored(firstPaymentDate, index + 1, anchor);
  return { index, start, end: addDays(nextDueDate, -1), nextDueDate };
}

/** Fecha de vencimiento del período `index` (el período 0 se paga al contratar). */
export function dueDateOf(firstPaymentDate: CalendarDate, index: number): CalendarDate {
  return billingPeriod(firstPaymentDate, index).start;
}

export function graceEndDate(dueDate: CalendarDate, graceDays = DEFAULT_GRACE_DAYS): CalendarDate {
  return addDays(dueDate, graceDays);
}

export type AccessLight = "current" | "grace" | "suspended";

export interface UnpaidCharge {
  dueDate: CalendarDate;
  totalCents: number;
  paidCents: number;
  /** Lo que se cobra en efectivo, si es menos (cargo sin pagos previos). */
  cashCents?: number | null;
}

export type MembershipLight =
  | { light: "current"; nextDueDate: CalendarDate | null }
  | { light: "grace"; dueDate: CalendarDate; graceEndsOn: CalendarDate; daysLeft: number; amountDueCents: number; cashDueCents?: number }
  | { light: "suspended"; dueDate: CalendarDate; suspendedSince: CalendarDate; amountDueCents: number; cashDueCents?: number };

/**
 * Estado del semáforo para una cuota de profe en una fecha.
 *
 * Mira el cargo impago más antiguo que ya venció. `daysLeft` cuenta el día de hoy:
 * el último día de gracia devuelve 1.
 */
export function membershipLight(params: {
  today: CalendarDate;
  charges: UnpaidCharge[];
  nextDueDate: CalendarDate | null;
  graceDays?: number;
}): MembershipLight {
  const graceDays = params.graceDays ?? DEFAULT_GRACE_DAYS;
  const overdue = params.charges
    .filter((c) => c.paidCents < c.totalCents && diffDays(c.dueDate, params.today) > 0)
    .sort((a, b) => diffDays(b.dueDate, a.dueDate));

  const oldest = overdue[0];
  if (!oldest) return { light: "current", nextDueDate: params.nextDueDate };

  const amountDueCents = overdue.reduce((sum, c) => sum + (c.totalCents - c.paidCents), 0);
  // Pagando en efectivo (sólo cargos sin pagos previos con precio en efectivo).
  const cashTotal = overdue.reduce((sum, c) => sum + (c.cashCents ?? c.totalCents - c.paidCents), 0);
  const cash = cashTotal < amountDueCents ? { cashDueCents: cashTotal } : {};
  const graceEndsOn = graceEndDate(oldest.dueDate, graceDays);
  const daysLeft = diffDays(params.today, graceEndsOn) + 1;

  if (daysLeft >= 1) {
    return { light: "grace", dueDate: oldest.dueDate, graceEndsOn, daysLeft, amountDueCents, ...cash };
  }
  return { light: "suspended", dueDate: oldest.dueDate, suspendedSince: addDays(graceEndsOn, 1), amountDueCents, ...cash };
}

/** El acceso a las clases de la cuota está habilitado en verde y en amarillo. */
export function membershipGrantsAccess(state: MembershipLight): boolean {
  return state.light !== "suspended";
}
