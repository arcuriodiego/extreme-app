/**
 * Reglas de la grilla semanal que se muestran o validan en la app.
 * Los controles definitivos (salas sin superposición, academia, permisos)
 * los hace la base; acá se validan los formularios para dar mensajes claros.
 */

export const WEEKDAYS = [
  { n: 1, label: "Lunes", short: "Lun" },
  { n: 2, label: "Martes", short: "Mar" },
  { n: 3, label: "Miércoles", short: "Mié" },
  { n: 4, label: "Jueves", short: "Jue" },
  { n: 5, label: "Viernes", short: "Vie" },
  { n: 6, label: "Sábado", short: "Sáb" },
  { n: 7, label: "Domingo", short: "Dom" },
] as const;

export function weekdayLabel(n: number): string {
  return WEEKDAYS.find((d) => d.n === n)?.label ?? "";
}

/** Nombre de un grupo: "Hip Hop · Teens · Principiante". El nivel es opcional. */
export function groupName(parts: { style: string; ageCategory: string; level?: string | null }): string {
  return [parts.style, parts.ageCategory, parts.level].filter((p) => p && p.trim()).join(" · ");
}

/** "19:00:00" o "19:00" → "19:00". */
export function shortTime(value: string): string {
  return value.slice(0, 5);
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface ScheduleInput {
  weekday: unknown;
  start: unknown;
  end: unknown;
  roomId: unknown;
}

export type ScheduleErrors = Partial<Record<"weekday" | "start" | "end" | "roomId", string>>;

export function validateSchedule(input: ScheduleInput):
  | { ok: true; value: { weekday: number; start: string; end: string; roomId: string } }
  | { ok: false; errors: ScheduleErrors } {
  const errors: ScheduleErrors = {};
  const weekday = Number(input.weekday);
  const start = typeof input.start === "string" ? input.start.trim() : "";
  const end = typeof input.end === "string" ? input.end.trim() : "";
  const roomId = typeof input.roomId === "string" ? input.roomId : "";

  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) errors.weekday = "Elegí el día.";
  if (!HHMM.test(start)) errors.start = "Poné la hora de inicio (por ejemplo 19:00).";
  if (!HHMM.test(end)) errors.end = "Poné la hora de fin (por ejemplo 20:30).";
  if (!errors.start && !errors.end) {
    const length = minutes(end) - minutes(start);
    if (length <= 0) errors.end = "La clase tiene que terminar después de empezar.";
    else if (length < 15) errors.end = "La clase tiene que durar al menos 15 minutos.";
  }
  if (!roomId) errors.roomId = "Elegí la sala.";

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { weekday, start, end, roomId } };
}

/** Valida el nombre de un estilo, nivel, categoría o sala. */
export function validateCatalogName(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, error: "Escribí un nombre." };
  if (name.length > 40) return { ok: false, error: "Usá 40 letras como máximo." };
  return { ok: true, value: name };
}

/** Cupo de un grupo o capacidad de una sala: entero entre 1 y 200. */
export function validateCapacity(value: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const text = typeof value === "string" ? value.trim() : String(value ?? "");
  const n = Number(text);
  if (!/^\d+$/.test(text) || n < 1 || n > 200) return { ok: false, error: "Poné un número entre 1 y 200." };
  return { ok: true, value: n };
}

export interface GridSlot {
  id: string;
  weekday: number;
  start: string;
  end: string;
}

/**
 * Agrupa horarios por día de la semana (lunes primero) y los ordena por hora.
 * Devuelve sólo los días que tienen clases.
 */
export function weeklyGrid<T extends GridSlot>(slots: readonly T[]): { weekday: number; label: string; slots: T[] }[] {
  return WEEKDAYS.map((d) => ({
    weekday: d.n,
    label: d.label,
    slots: slots
      .filter((s) => s.weekday === d.n)
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)),
  })).filter((d) => d.slots.length > 0);
}
