"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { academyConfig } from "@/config/academy";
import { authErrorMessage } from "@/domain/auth/errors";
import { HOME_PATH, SIGN_IN_PATH, safeNextPath } from "@/domain/auth/routes";
import {
  emailError,
  normalizeEmail,
  validateNewPassword,
  validateProfile,
  validateSignIn,
  validateSignUp,
} from "@/domain/auth/validation";
import { calendarDateInZone } from "@/domain/shared/calendar-date";
import { createClient, siteOrigin } from "@/lib/supabase/server";

export interface FormState {
  /** Error general del formulario (ej. contraseña incorrecta). */
  error?: string;
  /** Error por campo. */
  fieldErrors?: Record<string, string | undefined>;
  /** Mensaje de éxito. */
  message?: string;
  /** Valores para volver a mostrar en el formulario (nunca contraseñas). */
  values?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function secret(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(text(formData, "email"));
  const password = secret(formData, "password");
  const next = safeNextPath(formData.get("next")) ?? HOME_PATH;

  const fieldErrors = validateSignIn({ email, password });
  if (fieldErrors) return { fieldErrors, values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error), values: { email } };

  redirect(next);
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    email: normalizeEmail(text(formData, "email")),
    accountType: text(formData, "accountType") === "guardian" ? "guardian" : "student",
  };
  const password = secret(formData, "password");
  const passwordConfirm = secret(formData, "passwordConfirm");

  const fieldErrors = validateSignUp({ ...values, password, passwordConfirm });
  if (fieldErrors) return { fieldErrors, values };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${HOME_PATH}`,
      data: { first_name: values.firstName, last_name: values.lastName, academy: academyConfig.slug, account_type: values.accountType },
    },
  });
  if (error) return { error: authErrorMessage(error), values };

  // Si la confirmación por email está desactivada, la sesión ya está iniciada.
  if (data.session) redirect(HOME_PATH);

  return {
    message: `Te enviamos un email a ${values.email}. Abrí el enlace para activar tu cuenta. Si no llega en unos minutos, revisá la carpeta de spam.`,
  };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(text(formData, "email"));
  const invalid = emailError(email);
  if (invalid) return { fieldErrors: { email: invalid }, values: { email } };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/nueva-clave`,
  });
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
    return { error: authErrorMessage(error), values: { email } };
  }

  // Mismo mensaje exista o no la cuenta: así nadie puede averiguar qué emails están registrados.
  return { message: `Si ${email} tiene una cuenta, te llegará un email con un enlace para crear una contraseña nueva.` };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = secret(formData, "password");
  const passwordConfirm = secret(formData, "passwordConfirm");

  const fieldErrors = validateNewPassword({ password, passwordConfirm });
  if (fieldErrors) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authErrorMessage(error) };

  redirect(`${HOME_PATH}?aviso=clave-actualizada`);
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    phone: text(formData, "phone"),
    birthDate: text(formData, "birthDate"),
  };
  const today = calendarDateInZone(new Date(), academyConfig.timeZone);
  const fieldErrors = validateProfile(values, today);
  if (fieldErrors) return { fieldErrors, values };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(SIGN_IN_PATH);

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: values.firstName,
      last_name: values.lastName,
      phone: values.phone || null,
      birth_date: values.birthDate || null,
    })
    .eq("id", user.id);
  if (error) return { error: "No pudimos guardar los cambios. Probá de nuevo.", values };

  revalidatePath("/", "layout");
  return { message: "Guardamos tus datos.", values };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(SIGN_IN_PATH);
}
