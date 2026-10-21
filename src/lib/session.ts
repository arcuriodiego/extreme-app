import "server-only";
import { redirect } from "next/navigation";
import { type Access, type PermissionCode, type RoleCode, isRoleCode, sortRoles } from "@/domain/auth/roles";
import { SIGN_IN_PATH } from "@/domain/auth/routes";
import { createClient } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: string;
  access: Access;
}

/**
 * Usuario con sesión, su perfil y sus permisos. Si no hay sesión, manda a "Ingresar".
 * El proxy ya lo verifica antes, pero cada página vuelve a comprobarlo:
 * la seguridad no depende de un solo control. Los permisos los calcula la base.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(SIGN_IN_PATH);

  const [{ data: profile }, { data: accessRows }] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name, phone, birth_date").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_access"),
  ]);

  const row = (Array.isArray(accessRows) ? accessRows[0] : accessRows) as
    | { role_codes?: string[]; permission_codes?: string[] }
    | null
    | undefined;

  return {
    id: user.id,
    email: user.email ?? "",
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    phone: profile?.phone ?? "",
    birthDate: profile?.birth_date ?? "",
    access: {
      roles: sortRoles((row?.role_codes ?? []).filter(isRoleCode)) as RoleCode[],
      permissions: (row?.permission_codes ?? []) as PermissionCode[],
    },
  };
}
