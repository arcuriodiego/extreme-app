"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRoleCode } from "@/domain/auth/roles";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Asigna o quita un rol. Los controles reales (permiso, academia, último admin)
 * los hace la base en grant_role / revoke_role; acá sólo se valida el formato.
 */
export async function setRole(formData: FormData): Promise<void> {
  const profileId = String(formData.get("profileId") ?? "");
  const role = formData.get("role");
  const op = formData.get("op");
  const q = String(formData.get("q") ?? "").slice(0, 80);

  const back = (params: Record<string, string>) => {
    const search = new URLSearchParams({ ...(q ? { q } : {}), ...params });
    return `/admin/usuarios?${search.toString()}`;
  };

  if (!UUID.test(profileId) || !isRoleCode(role) || (op !== "grant" && op !== "revoke")) {
    redirect(back({ error: "datos" }));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(op === "grant" ? "grant_role" : "revoke_role", {
    p_profile_id: profileId,
    p_role_code: role,
  });

  if (error) {
    const code =
      error.code === "42501" ? "sin-permiso" : error.message.includes("al menos una persona") ? "ultimo-admin" : "generico";
    redirect(back({ error: code }));
  }

  revalidatePath("/admin/usuarios");
  redirect(back({ aviso: op === "grant" ? "rol-asignado" : "rol-quitado" }));
}
