/**
 * Workshops: reglas que se muestran en pantalla y validación de formularios.
 * La regla de devolución la aplica la base al cancelar; acá se calcula igual
 * para avisar antes de confirmar.
 */
import type { Cents } from "../shared/money.ts";
import { parsePesos } from "../billing/prices.ts";

/** Anticipación mínima para cancelar con devolución (aprobado por Diego, 22 oct). */
export const REFUND_HOURS = 48;

/** Hasta cuándo se puede cancelar con devolución. */
export function refundDeadline(firstStart: Date): Date {
  return new Date(firstStart.getTime() - REFUND_HOURS * 3_600_000);
}

/** Cuánto corresponde devolver si se cancela ahora. */
export function refundIfCancelled(firstStart: Date | null, now: Date, paidCents: Cents): Cents {
  if (!firstStart) return paidCents;
  return now.getTime() <= refundDeadline(firstStart).getTime() ? paidCents : 0;
}

export function seatsLabel(capacity: number, taken: number): string {
  const left = Math.max(0, capacity - taken);
  if (left === 0) return "Completo";
  return left === 1 ? "Queda 1 lugar" : `Quedan ${left} lugares`;
}

export interface WorkshopInput {
  title: unknown;
  description: unknown;
  teacherName: unknown;
  price: unknown;
  capacity: unknown;
}

export function validateWorkshop(input: WorkshopInput):
  | { ok: true; value: { title: string; description: string | null; teacherName: string | null; priceCents: Cents; capacity: number } }
  | { ok: false; error: "titulo" | "precio" | "cupo" } {
  const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
  const title = text(input.title);
  if (!title || title.length > 80) return { ok: false, error: "titulo" };
  const priceCents = parsePesos(input.price);
  if (priceCents === null) return { ok: false, error: "precio" };
  const capText = text(input.capacity);
  const capacity = Number(capText);
  if (!/^\d+$/.test(capText) || capacity < 1 || capacity > 500) return { ok: false, error: "cupo" };
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 2000) : "";
  const teacherName = text(input.teacherName).slice(0, 80);
  return { ok: true, value: { title, description: description || null, teacherName: teacherName || null, priceCents, capacity } };
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Una jornada: fecha, hora de inicio y fin (misma fecha), sala. */
export function validateWorkshopSession(input: { date: unknown; start: unknown; end: unknown; roomId: unknown }, today: string):
  | { ok: true; value: { date: string; startMinutes: number; endMinutes: number; roomId: string } }
  | { ok: false; error: "fecha" | "fecha-pasada" | "hora" | "sala" } {
  const date = typeof input.date === "string" ? input.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "fecha" };
  if (date < today) return { ok: false, error: "fecha-pasada" };
  const start = typeof input.start === "string" ? input.start : "";
  const end = typeof input.end === "string" ? input.end : "";
  if (!HHMM.test(start) || !HHMM.test(end)) return { ok: false, error: "hora" };
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const startMinutes = toMin(start);
  const endMinutes = toMin(end);
  if (endMinutes - startMinutes < 15) return { ok: false, error: "hora" };
  const roomId = typeof input.roomId === "string" ? input.roomId : "";
  if (!roomId) return { ok: false, error: "sala" };
  return { ok: true, value: { date, startMinutes, endMinutes, roomId } };
}
