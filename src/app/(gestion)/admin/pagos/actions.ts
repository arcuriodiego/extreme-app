"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACK = "/admin/pagos/recordatorios";

/** Registra el recordatorio (para mostrar "enviado el…") y abre WhatsApp con el mensaje listo. */
export async function sendReminder(formData: FormData): Promise<void> {
  const familyKey = String(formData.get("family_key") ?? "");
  const chargeIds = formData.getAll("charge_id").map(String).filter((id) => UUID.test(id));
  const href = String(formData.get("href") ?? "");
  if (!/^[gs]:[0-9a-f-]{36}$/i.test(familyKey) || chargeIds.length === 0 || !href.startsWith("https://wa.me/")) {
    redirect(`${BACK}?error=datos`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_fee_reminder", { p_family_key: familyKey, p_charge_ids: chargeIds });
  if (error) redirect(`${BACK}?error=${error.code === "42501" ? "sin-permiso" : "generico"}`);
  redirect(href);
}
