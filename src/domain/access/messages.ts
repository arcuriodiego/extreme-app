/** Textos del resultado de un ingreso (escáner de recepción y del profe). */

export type EntryResult = "allowed" | "grace" | "denied" | "invalid";

export interface Entry {
  result: EntryResult;
  reason: string;
  studentId: string | null;
  studentName: string | null;
  label: string | null;
  startsAt: string | null;
  already: boolean;
}

/** Lee la respuesta de la base sin confiar en su forma. */
export function toEntry(raw: unknown): Entry {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const result = ["allowed", "grace", "denied", "invalid"].includes(r.result as string) ? (r.result as EntryResult) : "invalid";
  return {
    result,
    reason: str(r.reason) ?? "qr-invalido",
    studentId: str(r.student_id),
    studentName: str(r.student_name),
    label: str(r.label),
    startsAt: str(r.starts_at),
    already: r.already === true,
  };
}

export const ENTRY_TITLES: Record<EntryResult, string> = {
  allowed: "Puede pasar",
  grace: "Puede pasar · cuota en gracia",
  denied: "No puede pasar",
  invalid: "Código no válido",
};

export const ENTRY_REASONS: Record<string, string> = {
  fija: "Su clase fija, con la cuota al día.",
  reserva: "Tiene reservada esta clase.",
  workshop: "Está inscripto al workshop.",
  gracia: "La cuota venció y está en los días de gracia: recordale pagarla.",
  "cuota-vencida": "La cuota está vencida y pasó la gracia: tiene que pagarla para entrar.",
  "sin-primer-pago": "Falta el primer pago de la cuota.",
  "sin-clase": "No tiene clase en este horario. Si tiene pack, reservale la clase desde su ficha; si no, puede pagar una clase individual.",
  "qr-invalido": "No es un pase de la academia. Pedile que abra Mis pases en la app.",
  "qr-vencido": "El código ya cambió (¿es una captura?). Pedile que muestre el QR en vivo desde la app.",
  habilitado: "Habilitado para la clase.",
  "no-habilitado": "No está habilitado: que pase por recepción.",
  "sin-permiso": "Tu usuario no tiene permiso para registrar ingresos.",
  error: "No pudimos validar el ingreso. Revisá la conexión y probá de nuevo.",
};

export function entryReason(reason: string): string {
  return ENTRY_REASONS[reason] ?? "No pudimos validar el ingreso.";
}
