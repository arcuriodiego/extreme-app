"use server";

import { redirect } from "next/navigation";
import { isCounterMethod, validatePaymentForm } from "@/domain/billing/payments";
import { startOfDayInZone } from "@/domain/shared/calendar-date";
import { validateWorkshop, validateWorkshopSession } from "@/domain/workshops/workshops";
import { academyConfig } from "@/config/academy";
import { academyToday } from "@/lib/grilla";
import { createClient } from "@/lib/supabase/server";

/**
 * Acciones de workshops. Permisos, cupo, salas y la regla de 48 h los controla la base.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function to(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

function code(error: { code?: string; message?: string }): string {
  const m = error.message ?? "";
  if (m.startsWith("No hay lugar")) return "completo";
  if (m.startsWith("Hay lugar")) return "hay-lugar";
  if (m.startsWith("Ya está en la lista")) return "ya-en-lista";
  if (m.startsWith("Ya está inscripto")) return "ya-inscripto";
  if (m.startsWith("Ese workshop no está abierto")) return "no-publicado";
  if (m.startsWith("Ese workshop ya empezó")) return "ya-empezo";
  if (m.startsWith("No hay nada pendiente")) return "nada-que-devolver";
  if (m.startsWith("Se cobra el total")) return "pago-total";
  if (m.startsWith("Ese cargo ya está pagado")) return "ya-pagado";
  if (error.code === "23P01") return "sala-ocupada";
  if (error.code === "42501") return "sin-permiso";
  if (error.code === "P0002") return "no-disponible";
  if (error.code === "22023") return "datos";
  return "generico";
}

function readWorkshop(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    teacherName: formData.get("teacher_name"),
    price: formData.get("price"),
    capacity: formData.get("capacity"),
  };
}

export async function createWorkshop(formData: FormData): Promise<void> {
  const checked = validateWorkshop(readWorkshop(formData));
  if (!checked.ok) to("/admin/workshops/nuevo", { error: checked.error });
  const v = checked.value;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshops")
    .insert({ title: v.title, description: v.description, teacher_name: v.teacherName, price_cents: v.priceCents, capacity: v.capacity })
    .select("id")
    .single();
  if (error || !data) to("/admin/workshops/nuevo", { error: error ? code(error) : "generico" });
  to(`/admin/workshops/${data.id}`, { aviso: "creado" });
}

export async function updateWorkshop(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  if (!UUID.test(id)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const checked = validateWorkshop(readWorkshop(formData));
  if (!checked.ok) to(back, { error: checked.error });
  const v = checked.value;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshops")
    .update({ title: v.title, description: v.description, teacher_name: v.teacherName, price_cents: v.priceCents, capacity: v.capacity })
    .eq("id", id)
    .select("id");
  if (error) to(back, { error: code(error) });
  if (!data || data.length === 0) to(back, { error: "sin-permiso" });
  to(back, { aviso: "guardado" });
}

export async function setPublished(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const publish = str(formData, "publish") === "true";
  if (!UUID.test(id)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const supabase = await createClient();
  if (publish) {
    const { count } = await supabase.from("workshop_sessions").select("id", { count: "exact", head: true }).eq("workshop_id", id);
    if (!count) to(back, { error: "sin-fechas" });
  }
  const { data, error } = await supabase.from("workshops").update({ status: publish ? "published" : "draft" }).eq("id", id).select("id");
  if (error) to(back, { error: code(error) });
  if (!data || data.length === 0) to(back, { error: "sin-permiso" });
  to(back, { aviso: publish ? "publicado" : "despublicado" });
}

export async function cancelWorkshop(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  if (!UUID.test(id)) to("/admin/workshops", { error: "datos" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_workshop", { p_workshop_id: id });
  if (error) to(`/admin/workshops/${id}`, { error: code(error) });
  to(`/admin/workshops/${id}`, { aviso: "cancelado" });
}

export async function addWorkshopSession(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  if (!UUID.test(id)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const checked = validateWorkshopSession(
    { date: str(formData, "date"), start: str(formData, "start"), end: str(formData, "end"), roomId: str(formData, "room_id") },
    academyToday(),
  );
  if (!checked.ok) to(back, { error: `jornada-${checked.error}` });
  const v = checked.value;
  if (!UUID.test(v.roomId)) to(back, { error: "jornada-sala" });
  const dayStart = startOfDayInZone(v.date, academyConfig.timeZone).getTime();
  const supabase = await createClient();
  const { error } = await supabase.from("workshop_sessions").insert({
    workshop_id: id,
    starts_at: new Date(dayStart + v.startMinutes * 60_000).toISOString(),
    ends_at: new Date(dayStart + v.endMinutes * 60_000).toISOString(),
    room_id: v.roomId,
  });
  if (error) to(back, { error: code(error) });
  to(back, { aviso: "jornada-agregada" });
}

export async function removeWorkshopSession(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  const sessionId = str(formData, "session_id");
  if (!UUID.test(id) || !UUID.test(sessionId)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const supabase = await createClient();
  const { data, error } = await supabase.from("workshop_sessions").delete().eq("id", sessionId).eq("workshop_id", id).select("id");
  if (error) to(back, { error: code(error) });
  if (!data || data.length === 0) to(back, { error: "sin-permiso" });
  to(back, { aviso: "jornada-quitada" });
}

export async function registerStudent(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  const studentId = str(formData, "student_id");
  if (!UUID.test(id) || !UUID.test(studentId)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const method = formData.get("method");
  if (!isCounterMethod(method)) to(back, { error: "pago-medio" });
  const supabase = await createClient();
  // Inscribir y cobrar el total van juntos: sin pago no hay lugar (decisión de Diego, 23 oct).
  const { error } = await supabase.rpc("enroll_workshop", {
    p_workshop_id: id,
    p_student_id: studentId,
    p_method: method,
    p_reference: str(formData, "reference").slice(0, 80) || null,
  });
  if (error) to(back, { error: code(error) });
  to(back, { aviso: "inscripto" });
}

export async function registerGuest(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  if (!UUID.test(id)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const firstName = str(formData, "first_name").slice(0, 80);
  if (!firstName) to(back, { error: "nombre" });
  const phone = str(formData, "phone");
  if (phone && !/^[0-9 +()-]{6,25}$/.test(phone)) to(back, { error: "telefono" });
  const dni = str(formData, "dni").replace(/[.\s-]/g, "");
  if (dni && !/^[0-9A-Za-z]{6,12}$/.test(dni)) to(back, { error: "dni" });
  const method = formData.get("method");
  if (!isCounterMethod(method)) to(back, { error: "pago-medio" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_workshop_guest", {
    p_workshop_id: id,
    p_first_name: firstName,
    p_last_name: str(formData, "last_name").slice(0, 80),
    p_phone: phone || null,
    p_dni: dni || null,
    p_method: method,
    p_reference: str(formData, "reference").slice(0, 80) || null,
  });
  if (error) to(back, { error: code(error) });
  to(back, { aviso: "inscripto" });
}

export async function payRegistration(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  const chargeId = str(formData, "charge_id");
  if (!UUID.test(id) || !UUID.test(chargeId)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const pending = Number(formData.get("pending_cents") ?? 0);
  const checked = validatePaymentForm(
    { amount: formData.get("amount"), method: formData.get("method"), reference: formData.get("reference") },
    Number.isSafeInteger(pending) && pending > 0 ? pending : 0,
  );
  if (!checked.ok) to(back, { error: `pago-${checked.error}` });
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_charge", {
    p_charge_id: chargeId,
    p_amount_cents: checked.value.amountCents,
    p_method: checked.value.method,
    p_reference: checked.value.reference,
  });
  if (error) to(back, { error: code(error) });
  to(back, { aviso: "pago-registrado" });
}

export async function cancelRegistration(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  const regId = str(formData, "registration_id");
  if (!UUID.test(id) || !UUID.test(regId)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_workshop_registration", {
    p_registration_id: regId,
    p_reason: str(formData, "reason").slice(0, 200) || null,
  });
  if (error) to(back, { error: code(error) });
  to(back, { aviso: Number(data) > 0 ? "cancelada-con-devolucion" : "cancelada" });
}

export async function recordRefund(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  const regId = str(formData, "registration_id");
  const method = formData.get("method");
  if (!UUID.test(id) || !UUID.test(regId)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  if (!isCounterMethod(method)) to(back, { error: "pago-medio" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_workshop_refund", { p_registration_id: regId, p_method: method });
  if (error) to(back, { error: code(error) });
  to(back, { aviso: "devuelto" });
}

/** Lista de espera: anota a un alumno de la academia. */
export async function waitlistStudent(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  const studentId = str(formData, "student_id");
  if (!UUID.test(id) || !UUID.test(studentId)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_workshop_waitlist", { p_workshop_id: id, p_student_id: studentId });
  if (error) to(back, { error: code(error) });
  to(back, { aviso: "en-espera" });
}

/** Lista de espera: anota a alguien de afuera (se le crea la ficha Ocasional si no existe). */
export async function waitlistGuest(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  if (!UUID.test(id)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const firstName = str(formData, "first_name").slice(0, 80);
  if (!firstName) to(back, { error: "nombre" });
  const phone = str(formData, "phone");
  if (phone && !/^[0-9 +()-]{6,25}$/.test(phone)) to(back, { error: "telefono" });
  const dni = str(formData, "dni").replace(/[.\s-]/g, "");
  if (dni && !/^[0-9A-Za-z]{6,12}$/.test(dni)) to(back, { error: "dni" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_workshop_waitlist_guest", {
    p_workshop_id: id,
    p_first_name: firstName,
    p_last_name: str(formData, "last_name").slice(0, 80),
    p_phone: phone || null,
    p_dni: dni || null,
  });
  if (error) to(back, { error: code(error) });
  to(back, { aviso: "en-espera" });
}

/** Lista de espera: lo saca (o libera el lugar guardado, que pasa al siguiente). */
export async function removeFromWaitlist(formData: FormData): Promise<void> {
  const id = str(formData, "workshop_id");
  const entryId = str(formData, "entry_id");
  if (!UUID.test(id) || !UUID.test(entryId)) to("/admin/workshops", { error: "datos" });
  const back = `/admin/workshops/${id}`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_workshop_waitlist", { p_entry_id: entryId });
  if (error) to(back, { error: code(error) });
  to(back, { aviso: "quitado-lista" });
}
