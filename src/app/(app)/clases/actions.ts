"use server";

import { redirect } from "next/navigation";
import { bookingErrorCode } from "@/domain/bookings/messages";
import { getActiveStudent } from "@/lib/active-student";
import { createClient } from "@/lib/supabase/server";

/**
 * Reservas que hace el alumno (o su tutor, para el alumno que está viendo) desde la app.
 * La base controla el vínculo, el saldo, el cupo y la regla de 12 h.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(formData: FormData, params: Record<string, string>): never {
  const to = String(formData.get("back") ?? "");
  const path = to.startsWith("/clases") || to.startsWith("/pases") ? to.split("?")[0] : "/clases";
  const dia = String(formData.get("dia") ?? "");
  const search = new URLSearchParams({ ...(/^\d{4}-\d{2}-\d{2}$/.test(dia) ? { dia } : {}), ...params });
  redirect(`${path}?${search.toString()}`);
}

export async function bookMySession(formData: FormData): Promise<void> {
  const id = String(formData.get("session_id") ?? "");
  if (!UUID.test(id)) back(formData, { error: "generico" });
  const [supabase, { active }] = await Promise.all([createClient(), getActiveStudent()]);
  const { error } = await supabase.rpc("book_session", active ? { p_session_id: id, p_student_id: active.id } : { p_session_id: id });
  if (error) back(formData, { error: bookingErrorCode(error) });
  back(formData, { aviso: "reservada" });
}

export async function joinWorkshopWaitlist(formData: FormData): Promise<void> {
  const id = String(formData.get("workshop_id") ?? "");
  if (!UUID.test(id)) back(formData, { error: "generico" });
  const [supabase, { active }] = await Promise.all([createClient(), getActiveStudent()]);
  const { error } = await supabase.rpc(
    "join_workshop_waitlist",
    active ? { p_workshop_id: id, p_student_id: active.id } : { p_workshop_id: id },
  );
  if (error) back(formData, { error: bookingErrorCode(error) });
  back(formData, { aviso: "en-espera" });
}

export async function leaveWorkshopWaitlist(formData: FormData): Promise<void> {
  const id = String(formData.get("entry_id") ?? "");
  if (!UUID.test(id)) back(formData, { error: "generico" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_workshop_waitlist", { p_entry_id: id });
  if (error) back(formData, { error: bookingErrorCode(error) });
  back(formData, { aviso: "salio-lista" });
}

export async function cancelMyBooking(formData: FormData): Promise<void> {
  const id = String(formData.get("booking_id") ?? "");
  if (!UUID.test(id)) back(formData, { error: "generico" });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking", { p_booking_id: id });
  if (error) back(formData, { error: bookingErrorCode(error) });
  back(formData, { aviso: data ? "cancelada-devuelta" : "cancelada-tarde" });
}
