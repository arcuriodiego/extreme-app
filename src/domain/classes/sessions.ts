/**
 * Clases concretas por fecha: lo que se muestra en el selector de días
 * y cómo se describe el estado de cada clase.
 */
import { WEEKDAYS } from "./schedule.ts";
import { addDays, type CalendarDate, isValidCalendarDate, isoWeekday } from "../shared/calendar-date.ts";

export interface StripDay {
  date: CalendarDate;
  short: string; // "MAR"
  dayNumber: number; // 21
  isToday: boolean;
}

/** Los próximos `count` días desde hoy, para elegir uno. */
export function dayStrip(today: CalendarDate, count = 7): StripDay[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i);
    const wd = WEEKDAYS.find((d) => d.n === isoWeekday(date));
    return {
      date,
      short: (wd?.short ?? "").toUpperCase(),
      dayNumber: Number(date.slice(8, 10)),
      isToday: i === 0,
    };
  });
}

/** El día elegido en la dirección (?dia=), si está dentro del selector; si no, hoy. */
export function pickDay(value: unknown, strip: readonly StripDay[]): CalendarDate {
  const fallback = strip[0]?.date ?? "";
  if (typeof value !== "string" || !isValidCalendarDate(value)) return fallback;
  return strip.some((d) => d.date === value) ? value : fallback;
}

/** "Martes 21 de octubre". */
export function longDate(date: CalendarDate): string {
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const wd = WEEKDAYS.find((d) => d.n === isoWeekday(date))?.label ?? "";
  return `${wd} ${Number(date.slice(8, 10))} de ${months[Number(date.slice(5, 7)) - 1] ?? ""}`;
}

export type SessionStatus = "scheduled" | "cancelled" | "completed";

export interface SessionNoticeInput {
  status: SessionStatus;
  cancelReason: string | null;
  teacherName: string | null;
  substituteName: string | null;
  fromHoliday: boolean;
}

export interface SessionBadge {
  tone: "alert" | "warn" | "neutral";
  text: string;
}

/** Avisos de una clase para mostrar (suspendida, reemplazo). */
export function sessionBadges(s: SessionNoticeInput): SessionBadge[] {
  if (s.status === "cancelled") {
    const label = s.fromHoliday ? "SIN CLASE" : "SUSPENDIDA";
    return [{ tone: "alert", text: s.cancelReason ? `${label} · ${s.cancelReason}` : label }];
  }
  if (s.substituteName) {
    return [{ tone: "warn", text: `REEMPLAZO · Prof. ${s.substituteName}` }];
  }
  return [];
}

/** El profe que efectivamente da la clase. */
export function teacherShown(s: { teacherName: string | null; substituteName: string | null }): string {
  const name = s.substituteName ?? s.teacherName;
  return name ? `Prof. ${name}` : "Profe a confirmar";
}

/** Validación del formulario de feriado o cierre. */
export function validateException(input: { date: unknown; description: unknown; kind: unknown }, today: CalendarDate):
  | { ok: true; value: { date: CalendarDate; description: string; kind: "holiday" | "closure" } }
  | { ok: false; error: "fecha" | "fecha-pasada" | "motivo" } {
  const date = typeof input.date === "string" ? input.date : "";
  if (!isValidCalendarDate(date)) return { ok: false, error: "fecha" };
  if (date < today) return { ok: false, error: "fecha-pasada" };
  const description = typeof input.description === "string" ? input.description.trim().replace(/\s+/g, " ") : "";
  if (!description || description.length > 80) return { ok: false, error: "motivo" };
  const kind = input.kind === "closure" ? "closure" : "holiday";
  return { ok: true, value: { date, description, kind } };
}
