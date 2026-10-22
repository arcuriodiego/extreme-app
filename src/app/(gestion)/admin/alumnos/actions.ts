"use server";

import { redirect } from "next/navigation";
import { validatePaymentForm } from "@/domain/billing/payments";
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

// ---------------------------------------------------------------------
// Cuota de profe
// ---------------------------------------------------------------------

function enrollErrorCode(error: { code?: string; message?: string }): string {
  const m = error.message ?? "";
  if (m.startsWith("No hay lugar")) return "completo";
  if (m.startsWith("El alumno ya tiene")) return "ya-tiene";
  if (m.startsWith("Ese horario no es de ese profe")) return "otro-profe";
  if (error.code === "42501") return "sin-permiso";
  if (error.code === "P0002") return "no-disponible";
  if (error.code === "22023") return "horarios-cantidad";
  return "generico";
}

export async function enrollStudent(formData: FormData): Promise<void> {
  const studentId = String(formData.get("student_id") ?? "");
  const teacherId = String(formData.get("teacher_id") ?? "");
  const ageId = String(formData.get("age_category_id") ?? "");
  if (![studentId, teacherId, ageId].every((v) => UUID.test(v))) to("/admin/alumnos", { error: "datos" });
  const back = `/admin/alumnos/${studentId}`;
  const keep = { profe: teacherId, cat: ageId };

  const scheduleIds = formData.getAll("schedule_id").map(String).filter((v) => UUID.test(v));
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("classes_per_week")
    .eq("kind", "teacher_monthly")
    .eq("active", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  const required = (plan?.classes_per_week as number | undefined) ?? 2;
  if (new Set(scheduleIds).size !== scheduleIds.length || scheduleIds.length !== required) {
    to(back, { ...keep, error: "horarios-cantidad" });
  }

  const { error } = await supabase.rpc("enroll_teacher_monthly", {
    p_student_id: studentId,
    p_teacher_id: teacherId,
    p_age_category_id: ageId,
    p_schedule_ids: scheduleIds,
  });
  if (error) to(back, { ...keep, error: enrollErrorCode(error) });
  to(back, { aviso: "inscripto" });
}

export async function changeEnrollment(formData: FormData): Promise<void> {
  const studentId = String(formData.get("student_id") ?? "");
  const enrollmentId = String(formData.get("enrollment_id") ?? "");
  const scheduleId = String(formData.get("schedule_id") ?? "");
  if (![studentId, enrollmentId, scheduleId].every((v) => UUID.test(v))) to("/admin/alumnos", { error: "datos" });
  const back = `/admin/alumnos/${studentId}`;

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_enrollment", { p_enrollment_id: enrollmentId, p_new_schedule_id: scheduleId });
  if (error) to(back, { error: enrollErrorCode(error) });
  to(back, { aviso: "horario-cambiado" });
}

export async function endMembership(formData: FormData): Promise<void> {
  const studentId = String(formData.get("student_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  if (!UUID.test(studentId) || !UUID.test(membershipId)) to("/admin/alumnos", { error: "datos" });
  const back = `/admin/alumnos/${studentId}`;

  const supabase = await createClient();
  const { error } = await supabase.rpc("end_membership", { p_membership_id: membershipId, p_reason: reason });
  if (error) to(back, { error: enrollErrorCode(error) });
  to(back, { aviso: "baja" });
}

// ---------------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------------

function payErrorCode(error: { code?: string; message?: string }): string {
  const m = error.message ?? "";
  if (m.startsWith("El importe supera")) return "pago-mayor";
  if (m.startsWith("Esa cuota ya tiene")) return "ya-pago";
  if (m.startsWith("El plan no tiene precio")) return "sin-precio";
  if (error.code === "42501") return "sin-permiso";
  if (error.code === "P0002") return "no-disponible";
  if (error.code === "22023") return "pago-datos";
  return "generico";
}

function readPayment(formData: FormData) {
  return { amount: formData.get("amount"), method: formData.get("method"), reference: formData.get("reference") };
}

export async function registerFirstPayment(formData: FormData): Promise<void> {
  const studentId = String(formData.get("student_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  if (!UUID.test(studentId) || !UUID.test(membershipId)) to("/admin/alumnos", { error: "datos" });
  const back = `/admin/alumnos/${studentId}`;
  const pending = Number(formData.get("pending_cents") ?? 0);

  const checked = validatePaymentForm(readPayment(formData), Number.isSafeInteger(pending) && pending > 0 ? pending : 0);
  if (!checked.ok) to(back, { error: `pago-${checked.error}` });

  const supabase = await createClient();
  const { error } = await supabase.rpc("first_membership_payment", {
    p_membership_id: membershipId,
    p_amount_cents: checked.value.amountCents,
    p_method: checked.value.method,
    p_reference: checked.value.reference,
  });
  if (error) to(back, { error: payErrorCode(error) });
  to(back, { aviso: "pago-registrado" });
}

export async function registerChargePayment(formData: FormData): Promise<void> {
  const studentId = String(formData.get("student_id") ?? "");
  const chargeId = String(formData.get("charge_id") ?? "");
  if (!UUID.test(studentId) || !UUID.test(chargeId)) to("/admin/alumnos", { error: "datos" });
  const back = `/admin/alumnos/${studentId}`;
  const pending = Number(formData.get("pending_cents") ?? 0);

  const checked = validatePaymentForm(readPayment(formData), Number.isSafeInteger(pending) && pending > 0 ? pending : 0);
  if (!checked.ok) to(back, { error: `pago-${checked.error}` });

  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_charge", {
    p_charge_id: chargeId,
    p_amount_cents: checked.value.amountCents,
    p_method: checked.value.method,
    p_reference: checked.value.reference,
  });
  if (error) to(back, { error: payErrorCode(error) });
  to(back, { aviso: "pago-registrado" });
}

export async function voidPayment(formData: FormData): Promise<void> {
  const studentId = String(formData.get("student_id") ?? "");
  const paymentId = String(formData.get("payment_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  const backTo = String(formData.get("back") ?? "");
  if (!UUID.test(paymentId)) to("/admin/alumnos", { error: "datos" });
  const back = backTo === "caja" ? "/admin/pagos" : UUID.test(studentId) ? `/admin/alumnos/${studentId}` : "/admin/alumnos";
  if (!reason) to(back, { error: "motivo-anulacion" });

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", { p_payment_id: paymentId, p_reason: reason });
  if (error) to(back, { error: payErrorCode(error) });
  to(back, { aviso: "pago-anulado" });
}
