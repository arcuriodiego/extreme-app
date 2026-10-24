/**
 * Reglas de la academia que administración puede cambiar desde Configuración.
 * Los rangos son los mismos que hace cumplir la base (setting_bounds).
 */

export interface RuleDef {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  help: string;
}

export interface RuleGroup {
  title: string;
  rules: RuleDef[];
}

export const RULE_GROUPS: readonly RuleGroup[] = [
  {
    title: "Cuotas",
    rules: [
      { key: "grace_days", label: "Días de gracia después del vencimiento", unit: "días", min: 0, max: 15, help: "Durante la gracia el alumno puede seguir viniendo. Vale desde ya para todas las cuotas vencidas." },
      { key: "due_reminder_days", label: "Aviso antes del vencimiento", unit: "días antes", min: 1, max: 10, help: "También es cuándo se genera la cuota del mes siguiente." },
      { key: "suspension_alert_days", label: "Alerta para decidir la baja", unit: "días suspendida", min: 7, max: 120, help: "Después de esos días suspendida aparece en el Panel y no se generan más cuotas." },
    ],
  },
  {
    title: "Reservas y cancelaciones",
    rules: [
      { key: "cancel_hours", label: "Anticipación para cancelar sin perder la clase", unit: "horas", min: 0, max: 48, help: "Con menos anticipación, la clase no se devuelve." },
      { key: "credit_days", label: "Plazo para usar el crédito por cancelación", unit: "días", min: 1, max: 30, help: "Días para reservar la clase después de cancelar una clase individual." },
      { key: "credit_class_window_days", label: "La clase del crédito puede ser hasta", unit: "días después", min: 1, max: 60, help: "Tiene que ser igual o mayor que el plazo para usar el crédito." },
    ],
  },
  {
    title: "Ingreso con QR",
    rules: [
      { key: "checkin_before_minutes", label: "Desde antes del inicio de la clase", unit: "minutos antes", min: 5, max: 120, help: "Clase de 19:00 con 30 → se puede ingresar desde las 18:30." },
      { key: "checkin_after_minutes", label: "Hasta después del inicio de la clase", unit: "minutos después", min: 0, max: 60, help: "Clase de 19:00 con 15 → hasta las 19:15." },
    ],
  },
  {
    title: "Workshops y clases",
    rules: [
      { key: "workshop_offer_hours", label: "Lugar guardado al primero de la lista de espera", unit: "horas", min: 1, max: 72, help: "Tiempo para pagarlo en recepción; si no, pasa al siguiente." },
      { key: "session_generation_weeks", label: "Clases generadas por adelantado", unit: "semanas", min: 4, max: 12, help: "Se aplica en la próxima generación diaria." },
    ],
  },
];

export const EDITABLE_RULES: readonly RuleDef[] = RULE_GROUPS.flatMap((g) => g.rules);

/** Lee el formulario: valores enteros dentro de su rango. Devuelve sólo los que cambiaron. */
export function validateRules(
  input: Record<string, unknown>,
  current: Readonly<Record<string, number>>,
): { ok: true; changed: Record<string, number> } | { ok: false; key: string; error: "numero" | "rango" | "credito" } {
  const next: Record<string, number> = { ...current };
  const changed: Record<string, number> = {};
  for (const rule of EDITABLE_RULES) {
    const raw = input[rule.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const text = String(raw).trim();
    if (!/^\d{1,4}$/.test(text)) return { ok: false, key: rule.key, error: "numero" };
    const value = Number(text);
    if (value < rule.min || value > rule.max) return { ok: false, key: rule.key, error: "rango" };
    next[rule.key] = value;
    if (current[rule.key] !== value) changed[rule.key] = value;
  }
  if ((next.credit_class_window_days ?? 0) < (next.credit_days ?? 0)) return { ok: false, key: "credit_class_window_days", error: "credito" };
  return { ok: true, changed };
}
