"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACK = "/admin/pagos/transferencias";

/** Recepción confirma que entró la transferencia: se cobra y se activa lo comprado. */
export async function confirmTransfer(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect(`${BACK}?error=datos`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_transfer_purchase", { p_purchase_id: id });
  if (error) redirect(`${BACK}?error=${error.code === "42501" ? "sin-permiso" : "generico"}`);
  redirect(`${BACK}?aviso=${data === "review" ? "a-revisar" : "confirmada"}`);
}

export async function rejectTransfer(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID.test(id)) redirect(`${BACK}?error=datos`);
  if (!reason) redirect(`${BACK}?error=motivo`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_transfer_purchase", { p_purchase_id: id, p_reason: reason.slice(0, 200) });
  if (error) redirect(`${BACK}?error=${error.code === "42501" ? "sin-permiso" : "generico"}`);
  redirect(`${BACK}?aviso=rechazada`);
}
