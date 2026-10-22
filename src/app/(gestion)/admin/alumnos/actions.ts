"use server";

import { redirect } from "next/navigation";
import { validateStudent } from "@/domain/people/student";
import { academyToday } from "@/lib/grilla";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function to(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

function readInput(formData: FormData) {
  return {
    firstName: formData.get("first_name"),
    lastName: formData.get("last_name"),
    dni: formData.get("dni"),
    birthDate: formData.get("birth_date"),
    phone: formData.get("phone"),
    status: formData.get("status"),
  };
}

function errorCode(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "dni-repetido";
  if (error.code === "42501") return "sin-permiso";
  if (error.code === "23514") return "datos";
  return "generico";
}

export async function createStudent(formData: FormData): Promise<void> {
  const checked = validateStudent(readInput(formData), academyToday());
  if (!checked.ok) to("/admin/alumnos/nuevo", { error: `campo-${Object.keys(checked.errors)[0]}` });
  const v = checked.value;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .insert({ first_name: v.firstName, last_name: v.lastName, dni: v.dni, birth_date: v.birthDate, phone: v.phone, status: v.status })
    .select("id")
    .single();
  if (error || !data) to("/admin/alumnos/nuevo", { error: error ? errorCode(error) : "generico" });
  to(`/admin/alumnos/${data.id}`, { aviso: "creado" });
}

export async function updateStudent(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) to("/admin/alumnos", { error: "datos" });
  const back = `/admin/alumnos/${id}`;
  const hasAccount = formData.get("has_account") === "1";

  const checked = validateStudent(readInput(formData), academyToday(), { withName: !hasAccount, withPhone: !hasAccount });
  if (!checked.ok) to(back, { error: `campo-${Object.keys(checked.errors)[0]}` });
  const v = checked.value;

  // Con cuenta, nombre y teléfono los maneja la persona desde la app.
  const changes = hasAccount
    ? { dni: v.dni, birth_date: v.birthDate, status: v.status }
    : { first_name: v.firstName, last_name: v.lastName, dni: v.dni, birth_date: v.birthDate, phone: v.phone, status: v.status };

  const supabase = await createClient();
  const { data, error } = await supabase.from("students").update(changes).eq("id", id).select("id");
  if (error) to(back, { error: errorCode(error) });
  if (!data || data.length === 0) to(back, { error: "sin-permiso" });
  to(back, { aviso: "guardado" });
}

export async function saveNotes(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) to("/admin/alumnos", { error: "datos" });
  const back = `/admin/alumnos/${id}`;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);

  const supabase = await createClient();
  const { error } = await supabase.from("student_notes").upsert({ student_id: id, notes }, { onConflict: "student_id" });
  if (error) to(back, { error: errorCode(error) });
  to(back, { aviso: "notas-guardadas" });
}
