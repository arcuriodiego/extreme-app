"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Inicio: "Soy alumno/a" o "Soy madre, padre o tutor/a". */
export async function chooseAccountKind(formData: FormData): Promise<void> {
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "student" && kind !== "guardian") redirect("/inicio");
  const supabase = await createClient();
  const { error } = await supabase.rpc("choose_account_kind", { p_kind: kind });
  if (error) redirect("/inicio?error=elegir");
  redirect("/inicio");
}
