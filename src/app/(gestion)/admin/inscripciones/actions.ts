"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACK = "/admin/inscripciones";

export async function resolveSignup(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID.test(id) || (status !== "confirmed" && status !== "dismissed")) redirect(`${BACK}?error=datos`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_signup", { p_request_id: id, p_status: status });
  if (error) redirect(`${BACK}?error=${error.code === "42501" ? "sin-permiso" : error.code === "P0002" ? "ya-resuelta" : "generico"}`);
  redirect(`${BACK}?aviso=${status === "confirmed" ? "resuelta" : "descartada"}`);
}
