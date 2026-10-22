"use server";

import { redirect } from "next/navigation";
import { validateException } from "@/domain/classes/sessions";
import { academyToday, grillaErrorCode } from "@/lib/grilla";
import { createClient } from "@/lib/supabase/server";

/**
 * Cambios del calendario. Cada uno llama a una función de la base que
 * verifica el permiso y deja registro en la auditoría.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function back(formData: FormData, params: Record<string, string>): never {
  const dia = str(formData, "dia");
  const search = new URLSearchParams({ ...(DATE.test(dia) ? { dia } : {}), ...params });
  redirect(`/admin/clases/calendario?${search.toString()}`);
}

export async function cancelSession(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const reason = str(formData, "reason").slice(0, 200);
  if (!UUID.test(id)) back(formData, { error: "datos" });
  if (!reason) back(formData, { error: "motivo" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_session", { p_id: id, p_reason: reason });
  if (error) back(formData, { error: grillaErrorCode(error) });
  back(formData, { aviso: "clase-suspendida" });
}

export async function restoreSession(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  if (!UUID.test(id)) back(formData, { error: "datos" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_session", { p_id: id });
  if (error) back(formData, { error: grillaErrorCode(error) });
  back(formData, { aviso: "clase-reactivada" });
}

export async function setSubstitute(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const teacher = str(formData, "teacher_id");
  if (!UUID.test(id) || (teacher !== "" && !UUID.test(teacher))) back(formData, { error: "datos" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_substitute", { p_id: id, p_teacher_id: teacher || null });
  if (error) back(formData, { error: grillaErrorCode(error) });
  back(formData, { aviso: teacher ? "reemplazo-guardado" : "reemplazo-quitado" });
}

export async function addException(formData: FormData): Promise<void> {
  const checked = validateException(
    { date: formData.get("date"), description: formData.get("description"), kind: formData.get("kind") },
    academyToday(),
  );
  if (!checked.ok) back(formData, { error: `feriado-${checked.error}` });
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_calendar_exception", {
    p_date: checked.value.date,
    p_description: checked.value.description,
    p_kind: checked.value.kind,
  });
  if (error) back(formData, { error: error.code === "23505" ? "feriado-repetido" : grillaErrorCode(error) });
  back(formData, { aviso: "feriado-agregado" });
}

export async function removeException(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  if (!UUID.test(id)) back(formData, { error: "datos" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_calendar_exception", { p_id: id });
  if (error) back(formData, { error: grillaErrorCode(error) });
  back(formData, { aviso: "feriado-quitado" });
}
