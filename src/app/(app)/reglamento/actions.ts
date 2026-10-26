"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/domain/auth/routes";
import { createClient } from "@/lib/supabase/server";

export async function acceptRegulation(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const next = safeNextPath(formData.get("next")) ?? "/inicio";
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_regulation", { p_regulation_id: id });
  if (error) redirect(`/reglamento?error=${error.hint === "reglamento-cambio" ? "cambio" : "generico"}`);
  redirect(next.includes("?") ? next : `${next}?aviso=reglamento-aceptado`);
}
