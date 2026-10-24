import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Un alumno que se maneja desde esta cuenta: la propia ficha o la de un hijo a cargo. */
export interface MyStudent {
  id: string;
  name: string;
  firstName: string;
  isSelf: boolean;
  canBook: boolean;
}

export const ACTIVE_STUDENT_COOKIE = "alumno";

/**
 * A quién se está viendo en el área personal (Inicio, Clases, Mis pases, Pagos).
 * Un tutor elige entre él y sus hijos; la elección queda en una cookie y se valida acá
 * contra los vínculos reales (la base además controla cada dato).
 */
export const getActiveStudent = cache(async (): Promise<{ active: MyStudent | null; options: MyStudent[] }> => {
  const supabase = await createClient();
  const [{ data }, jar] = await Promise.all([supabase.rpc("my_students"), cookies()]);
  const options = ((data ?? []) as { student_id: string; full_name: string; first_name: string; is_self: boolean; can_book: boolean }[]).map(
    (r) => ({ id: r.student_id, name: r.full_name, firstName: r.first_name, isSelf: r.is_self, canBook: r.can_book }),
  );
  const chosen = jar.get(ACTIVE_STUDENT_COOKIE)?.value;
  const active = options.find((o) => o.id === chosen) ?? options.find((o) => o.isSelf) ?? options[0] ?? null;
  return { active, options };
});
