import "server-only";
import { redirect } from "next/navigation";
import { SIGN_IN_PATH } from "@/domain/auth/routes";
import { createClient } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: string;
}

/**
 * Usuario con sesión y su perfil. Si no hay sesión, manda a "Ingresar".
 * El proxy ya lo verifica antes, pero cada página vuelve a comprobarlo:
 * la seguridad no depende de un solo control.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(SIGN_IN_PATH);

  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name, phone, birth_date")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    firstName: data?.first_name ?? "",
    lastName: data?.last_name ?? "",
    phone: data?.phone ?? "",
    birthDate: data?.birth_date ?? "",
  };
}
