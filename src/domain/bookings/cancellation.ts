/**
 * Cancelaciones, devolución de clases y créditos.
 *
 * Reglas aprobadas:
 * - Cancelar con 12 horas o más de anticipación (12 h exactas incluido) devuelve la clase.
 *   · Pagada con pack → vuelve al pack, con el vencimiento del pack.
 *   · Clase individual o crédito → se genera un crédito nuevo.
 * - Con menos de 12 horas no se devuelve (administración puede autorizar una excepción).
 * - El crédito vale 5 días corridos para reservar, y la clase reservada puede ser
 *   hasta 14 días después de generado el crédito.
 *
 * Los instantes son `Date` (UTC). La anticipación es una duración exacta, así que
 * no depende de la zona horaria.
 */

export const DEFAULT_CANCEL_HOURS = 12;
export const DEFAULT_CREDIT_DAYS = 5;
export const DEFAULT_CREDIT_CLASS_WINDOW_DAYS = 14;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type PayKind = "pack" | "single" | "credit" | "recovery";

export type CancellationOutcome =
  | { refunded: true; returnsTo: "pack" | "new_credit"; hoursBefore: number }
  | { refunded: false; reason: "too_late" | "already_started"; hoursBefore: number };

export function cancellationOutcome(params: {
  sessionStartsAt: Date;
  cancelledAt: Date;
  payKind: PayKind;
  cancelHours?: number;
}): CancellationOutcome {
  const cancelHours = params.cancelHours ?? DEFAULT_CANCEL_HOURS;
  const msBefore = params.sessionStartsAt.getTime() - params.cancelledAt.getTime();
  const hoursBefore = msBefore / HOUR_MS;

  if (msBefore <= 0) return { refunded: false, reason: "already_started", hoursBefore };
  if (msBefore < cancelHours * HOUR_MS) return { refunded: false, reason: "too_late", hoursBefore };

  return { refunded: true, returnsTo: params.payKind === "pack" ? "pack" : "new_credit", hoursBefore };
}

export interface CreditWindow {
  createdAt: Date;
  /** Hasta este instante se puede usar para reservar. */
  bookableUntil: Date;
  /** La clase reservada tiene que empezar, como tarde, en este instante. */
  classMustStartBy: Date;
}

export function creditWindow(
  createdAt: Date,
  creditDays = DEFAULT_CREDIT_DAYS,
  classWindowDays = DEFAULT_CREDIT_CLASS_WINDOW_DAYS,
): CreditWindow {
  return {
    createdAt,
    bookableUntil: new Date(createdAt.getTime() + creditDays * DAY_MS),
    classMustStartBy: new Date(createdAt.getTime() + classWindowDays * DAY_MS),
  };
}

export type CreditUseCheck =
  | { ok: true }
  | { ok: false; reason: "already_used" | "expired" | "class_too_far" | "class_in_past" };

export function canUseCredit(params: {
  credit: CreditWindow;
  alreadyUsed: boolean;
  bookingAt: Date;
  sessionStartsAt: Date;
}): CreditUseCheck {
  if (params.alreadyUsed) return { ok: false, reason: "already_used" };
  if (params.bookingAt.getTime() > params.credit.bookableUntil.getTime()) return { ok: false, reason: "expired" };
  if (params.sessionStartsAt.getTime() <= params.bookingAt.getTime()) return { ok: false, reason: "class_in_past" };
  if (params.sessionStartsAt.getTime() > params.credit.classMustStartBy.getTime()) {
    return { ok: false, reason: "class_too_far" };
  }
  return { ok: true };
}
