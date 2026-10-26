"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SIGNUP_ERRORS, type SignupFormState, validateSignup } from "@/domain/signup/signup";
import { academyToday } from "@/lib/grilla";
import { createClient } from "@/lib/supabase/server";

const FIELDS = ["for", "first_name", "last_name", "dni", "birth_date", "phone", "relationship", "note"] as const;

export async function submitSignup(_prev: SignupFormState, formData: FormData): Promise<SignupFormState> {
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")])) as Record<(typeof FIELDS)[number], string>;
  const scheduleIds = formData.getAll("schedule_id").map(String);
  const fail = (code: string): SignupFormState => ({ error: SIGNUP_ERRORS[code] ?? SIGNUP_ERRORS.generico, values, scheduleIds });

  const checked = validateSignup(
    {
      for: values.for,
      firstName: values.first_name,
      lastName: values.last_name,
      dni: values.dni,
      birthDate: values.birth_date,
      phone: values.phone,
      relationship: values.relationship,
      scheduleIds,
      note: values.note,
    },
    academyToday(),
  );
  if (!checked.ok) return fail(checked.error);
  const v = checked.value;

  const supabase = await createClient();
  const accept = String(formData.get("accept_regulation") ?? "");
  if (accept) {
    const { error: acceptError } = await supabase.rpc("accept_regulation", { p_regulation_id: accept });
    if (acceptError) return fail(acceptError.hint === "reglamento-cambio" ? "reglamento-cambio" : "generico");
  }
  const { data: studentId, error } = await supabase.rpc("submit_signup", {
    p_for: v.for,
    p_first_name: v.firstName,
    p_last_name: v.lastName,
    p_dni: v.dni,
    p_birth_date: v.birthDate,
    p_phone: v.phone,
    p_relationship: v.relationship,
    p_schedule_ids: v.scheduleIds,
    p_note: v.note,
  });
  if (error) return fail(error.hint && error.hint in SIGNUP_ERRORS ? error.hint : "generico");

  // Queda elegido el alumno recién inscripto (útil cuando es un hijo).
  if (typeof studentId === "string") {
    (await cookies()).set("alumno", studentId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: true });
  }
  redirect("/inicio?aviso=inscripcion-enviada");
}
