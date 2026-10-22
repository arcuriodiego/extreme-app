/**
 * Fichas de alumnos: estados y validación del formulario de recepción.
 */

export type StudentStatus = "trial" | "active" | "occasional" | "inactive";

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  trial: "Clase de prueba",
  active: "Activo",
  occasional: "Ocasional",
  inactive: "Inactivo",
};

export function isStudentStatus(value: unknown): value is StudentStatus {
  return typeof value === "string" && value in STUDENT_STATUS_LABELS;
}

export interface StudentInput {
  firstName: unknown;
  lastName: unknown;
  dni: unknown;
  birthDate: unknown;
  phone: unknown;
  status: unknown;
}

export interface StudentValue {
  firstName: string;
  lastName: string;
  dni: string | null;
  birthDate: string | null;
  phone: string | null;
  status: StudentStatus;
}

export type StudentErrors = Partial<Record<keyof StudentValue, string>>;

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/**
 * Valida una ficha. `withName` es falso para alumnos con cuenta:
 * su nombre lo maneja la persona desde la app.
 */
export function validateStudent(
  input: StudentInput,
  today: string,
  opts: { withName: boolean; withPhone: boolean } = { withName: true, withPhone: true },
): { ok: true; value: StudentValue } | { ok: false; errors: StudentErrors } {
  const errors: StudentErrors = {};
  const firstName = text(input.firstName);
  const lastName = text(input.lastName);
  const dni = text(input.dni).replace(/[.\s-]/g, "");
  const birthDate = text(input.birthDate);
  const phone = text(input.phone);

  if (opts.withName) {
    if (!firstName) errors.firstName = "Escribí el nombre.";
    else if (firstName.length > 80) errors.firstName = "Usá 80 letras como máximo.";
    if (lastName.length > 80) errors.lastName = "Usá 80 letras como máximo.";
  }
  if (dni && !/^[0-9A-Za-z]{6,12}$/.test(dni)) errors.dni = "Revisá el DNI: sólo números (o letras si es pasaporte), entre 6 y 12.";
  if (birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate < "1900-01-01") errors.birthDate = "Revisá la fecha de nacimiento.";
    else if (birthDate > today) errors.birthDate = "La fecha de nacimiento no puede ser futura.";
  }
  if (opts.withPhone && phone && !/^[0-9 +()-]{6,25}$/.test(phone)) errors.phone = "Revisá el teléfono: sólo números, espacios, + y guiones.";
  if (!isStudentStatus(input.status)) errors.status = "Elegí el estado.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      firstName,
      lastName,
      dni: dni ? dni.toUpperCase() : null,
      birthDate: birthDate || null,
      phone: phone || null,
      status: input.status as StudentStatus,
    },
  };
}

/** Edad cumplida en una fecha. */
export function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  let age = (y ?? 0) - (by ?? 0);
  if ((m ?? 0) < (bm ?? 0) || ((m ?? 0) === (bm ?? 0) && (d ?? 0) < (bd ?? 0))) age -= 1;
  return age;
}
