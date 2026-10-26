/**
 * Autoinscripción: validación del formulario (la base vuelve a controlar todo).
 */

export type SignupFor = "self" | "child";
export const RELATIONSHIPS = { madre: "Madre", padre: "Padre", tutor: "Tutor/a" } as const;
export type Relationship = keyof typeof RELATIONSHIPS;

export interface SignupValues {
  for: SignupFor;
  firstName: string;
  lastName: string;
  dni: string;
  birthDate: string;
  phone: string;
  relationship: Relationship | null;
  scheduleIds: string[];
  note: string | null;
}

export type SignupError =
  | "para"
  | "nombre"
  | "apellido"
  | "dni"
  | "nacimiento"
  | "telefono"
  | "relacion"
  | "sin-horario"
  | "muchos-horarios";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/** "40.123.456" o "40 123 456" → "40123456". */
export function normalizeDni(value: unknown): string {
  return clean(value).replace(/[.\s-]/g, "").toUpperCase();
}

export function validateSignup(
  input: {
    for: unknown;
    firstName: unknown;
    lastName: unknown;
    dni: unknown;
    birthDate: unknown;
    phone: unknown;
    relationship: unknown;
    scheduleIds: readonly unknown[];
    note: unknown;
  },
  today: string,
): { ok: true; value: SignupValues } | { ok: false; error: SignupError } {
  const who = input.for === "self" || input.for === "child" ? input.for : null;
  if (!who) return { ok: false, error: "para" };
  const firstName = clean(input.firstName).slice(0, 80);
  const lastName = clean(input.lastName).slice(0, 80);
  if (who === "child" && !firstName) return { ok: false, error: "nombre" };
  if (who === "child" && !lastName) return { ok: false, error: "apellido" };

  const dni = normalizeDni(input.dni);
  if (!/^[0-9A-Z]{6,12}$/.test(dni)) return { ok: false, error: "dni" };

  const birthDate = clean(input.birthDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate < "1900-01-01" || birthDate > today) return { ok: false, error: "nacimiento" };

  const phone = clean(input.phone);
  if (!/^[0-9 +()-]{6,25}$/.test(phone) || phone.replace(/\D/g, "").length < 6) return { ok: false, error: "telefono" };

  let relationship: Relationship | null = null;
  if (who === "child") {
    if (typeof input.relationship !== "string" || !(input.relationship in RELATIONSHIPS)) return { ok: false, error: "relacion" };
    relationship = input.relationship as Relationship;
  }

  const scheduleIds = [...new Set(input.scheduleIds.filter((v): v is string => typeof v === "string" && UUID.test(v)))];
  if (scheduleIds.length === 0) return { ok: false, error: "sin-horario" };
  if (scheduleIds.length > 6) return { ok: false, error: "muchos-horarios" };

  const note = clean(input.note).slice(0, 500) || null;
  return { ok: true, value: { for: who, firstName, lastName, dni, birthDate, phone, relationship, scheduleIds, note } };
}

export const SIGNUP_ERRORS: Record<string, string> = {
  para: "Elegí si la inscripción es para vos o para tu hijo/a.",
  nombre: "Escribí el nombre.",
  apellido: "Escribí el apellido.",
  dni: "Revisá el DNI (solo números, sin puntos).",
  nacimiento: "Revisá la fecha de nacimiento.",
  telefono: "Revisá el teléfono (por ejemplo 11 5555-1234).",
  relacion: "Elegí si sos la madre, el padre o tutor/a.",
  "sin-horario": "Elegí al menos un horario.",
  "muchos-horarios": "Elegí hasta 6 horarios.",
  horario: "Uno de los horarios ya no está disponible. Elegilos de nuevo.",
  "dni-repetido": "Ya hay un alumno con ese DNI en la academia. Pasá por recepción y lo vinculamos a tu cuenta.",
  reglamento: "Para enviar la inscripción, leé y aceptá el reglamento.",
  "reglamento-cambio": "El reglamento cambió mientras completabas el formulario. Recargá la página para leer la versión nueva.",
  "cuenta-tutor": "Tu cuenta es de madre, padre o tutor/a: desde acá anotás a tus hijos.",
  limite: "Llegaste al máximo de inscripciones desde tu cuenta. Pasá por recepción.",
  generico: "No pudimos enviar la inscripción. Probá de nuevo.",
};

/** Estado del formulario de inscripción entre envíos. */
export interface SignupFormState {
  error?: string;
  values?: Record<string, string>;
  scheduleIds?: string[];
}
