/**
 * Validación de los formularios de cuenta. Se usa en el servidor antes de
 * hablar con Supabase, y los mensajes se muestran tal cual al usuario.
 */

import { type CalendarDate, compareDates, isValidCalendarDate } from "../shared/calendar-date.ts";

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
const PHONE = /^[0-9 +()-]{6,25}$/;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const NAME_MAX = 80;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailError(email: string): string | undefined {
  if (!email) return "Ingresá tu email.";
  if (!EMAIL.test(email)) return "Revisá el email: parece incompleto.";
  return undefined;
}

export function passwordError(password: string): string | undefined {
  if (!password) return "Ingresá una contraseña.";
  if (password.length < PASSWORD_MIN) return `La contraseña necesita al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `La contraseña puede tener hasta ${PASSWORD_MAX} caracteres.`;
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Usá al menos una letra y un número.";
  return undefined;
}

function nameError(value: string, label: "nombre" | "apellido"): string | undefined {
  if (!value) return `Ingresá tu ${label}.`;
  if (value.length > NAME_MAX) return `El ${label} puede tener hasta ${NAME_MAX} caracteres.`;
  if (!NAME.test(value)) return `El ${label} sólo puede tener letras, espacios, apóstrofos y guiones.`;
  return undefined;
}

function compact<K extends string>(errors: FieldErrors<K>): FieldErrors<K> | null {
  const entries = Object.entries(errors).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as FieldErrors<K>) : null;
}

export function validateSignIn(input: { email: string; password: string }) {
  return compact<"email" | "password">({
    email: emailError(input.email),
    password: input.password ? undefined : "Ingresá tu contraseña.",
  });
}

export function validateSignUp(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordConfirm: string;
}) {
  return compact<"firstName" | "lastName" | "email" | "password" | "passwordConfirm">({
    firstName: nameError(input.firstName, "nombre"),
    lastName: nameError(input.lastName, "apellido"),
    email: emailError(input.email),
    password: passwordError(input.password),
    passwordConfirm:
      input.passwordConfirm === input.password ? undefined : "Las contraseñas no coinciden.",
  });
}

export function validateNewPassword(input: { password: string; passwordConfirm: string }) {
  return compact<"password" | "passwordConfirm">({
    password: passwordError(input.password),
    passwordConfirm:
      input.passwordConfirm === input.password ? undefined : "Las contraseñas no coinciden.",
  });
}

export function validateProfile(
  input: { firstName: string; lastName: string; phone: string; birthDate: string },
  today: CalendarDate,
) {
  let birthDate: string | undefined;
  if (input.birthDate) {
    if (!isValidCalendarDate(input.birthDate)) birthDate = "Revisá la fecha de nacimiento.";
    else if (compareDates(input.birthDate, "1900-01-01") < 0) birthDate = "Revisá el año de nacimiento.";
    else if (compareDates(input.birthDate, today) > 0) birthDate = "La fecha de nacimiento no puede ser futura.";
  }

  let phone: string | undefined;
  if (input.phone) {
    const digits = input.phone.replace(/\D/g, "").length;
    if (!PHONE.test(input.phone) || digits < 6) phone = "Revisá el teléfono: usá sólo números, espacios, + o guiones.";
  }

  return compact<"firstName" | "lastName" | "phone" | "birthDate">({
    firstName: nameError(input.firstName, "nombre"),
    lastName: nameError(input.lastName, "apellido"),
    phone,
    birthDate,
  });
}
