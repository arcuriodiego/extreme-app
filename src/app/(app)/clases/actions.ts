"use server";

import { redirect } from "next/navigation";
import { bookingErrorCode } from "@/domain/bookings/messages";
import { createClient } from "@/lib/supabase/server";

/** Reservas que hace el propio alumno desde la app. La base controla saldo, cupo y la regla de 12 h. */

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
  const supabase = await createClient();
  const { error } = await supabase.rpc("book_session", { p_session_id: id });
  if (error) back(formData, { error: bookingErrorCode(error) });
  back(formData, { aviso: "reservada" });
}

export async function cancelMyBooking(formData: FormData): Promise<void> {
  const id = String(formData.get("booking_id") ?? "");
  if (!UUID.test(id)) back(formData, { error: "generico" });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking", { p_booking_id: id });
  if (error) back(formData, { error: bookingErrorCode(error) });
  back(formData, { aviso: data ? "cancelada-devuelta" : "cancelada-tarde" });
}
