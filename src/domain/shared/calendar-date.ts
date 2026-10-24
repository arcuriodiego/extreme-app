/**
 * Fechas de calendario (sin hora), como "2026-11-10".
 *
 * Los vencimientos y la gracia se cuentan en días de calendario de la academia,
 * no en horas. Trabajar con texto "AAAA-MM-DD" evita los errores típicos de zona
 * horaria (que un vencimiento "se corra" un día por la diferencia con UTC).
 */

export type CalendarDate = string; // "AAAA-MM-DD"

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Parts {
  year: number;
  month: number; // 1-12
  day: number;
}

function parse(date: CalendarDate): Parts {
  const match = PATTERN.exec(date);
  if (!match) throw new Error(`Fecha inválida: "${date}". Formato esperado AAAA-MM-DD.`);
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) {
    throw new Error(`Fecha inexistente: "${date}".`);
  }
  return parts;
}

function format({ year, month, day }: Parts): CalendarDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Número de días desde una época fija; sirve para sumar y restar sin ambigüedad. */
function toDayNumber(date: CalendarDate): number {
  const { year, month, day } = parse(date);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

function fromDayNumber(n: number): CalendarDate {
  const d = new Date(n * 86_400_000);
  return format({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function isValidCalendarDate(date: string): boolean {
  try {
    parse(date);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Días entre dos fechas: positivo si `to` es posterior a `from`. */
export function diffDays(from: CalendarDate, to: CalendarDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return Math.sign(diffDays(b, a));
}

/**
 * Suma meses respetando un día "ancla".
 * Si el mes de destino no tiene ese día, usa el último día del mes.
 * Ej.: ancla 31 → 28/29 feb → 31 mar.
 */
export function addMonthsAnchored(date: CalendarDate, months: number, anchorDay: number): CalendarDate {
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new Error(`Día ancla inválido: ${anchorDay}.`);
  }
  const { year, month } = parse(date);
  const zeroBased = (month - 1) + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12 + 1;
  const day = Math.min(anchorDay, daysInMonth(targetYear, targetMonth));
  return format({ year: targetYear, month: targetMonth, day });
}

export function dayOfMonth(date: CalendarDate): number {
  return parse(date).day;
}

/** La fecha de calendario de un instante en una zona horaria (por defecto, la de la academia). */
export function calendarDateInZone(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Minutos que una zona horaria está adelantada respecto de UTC en ese instante (Buenos Aires: -180). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** El instante en que empieza un día de calendario en una zona horaria. */
export function startOfDayInZone(date: CalendarDate, timeZone: string): Date {
  const { year, month, day } = parse(date);
  const guess = new Date(Date.UTC(year, month - 1, day));
  const offset = zoneOffsetMinutes(guess, timeZone);
  const result = new Date(guess.getTime() - offset * 60_000);
  // Si justo ese día cambia el horario (verano), se corrige con el desfasaje real.
  const real = zoneOffsetMinutes(result, timeZone);
  return real === offset ? result : new Date(guess.getTime() - real * 60_000);
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(date: CalendarDate): number {
  const { year, month, day } = parse(date);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Hora local "HH:MM" de un instante en una zona horaria. */
export function timeInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" }).format(instant);
}
