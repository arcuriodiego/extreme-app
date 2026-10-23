import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface Timing {
  label: string;
  ms: number;
  ok: boolean;
}

async function time(label: string, fn: () => PromiseLike<{ error?: unknown } | unknown>): Promise<Timing> {
  const start = performance.now();
  let ok = true;
  try {
    const r = await fn();
    if (r && typeof r === "object" && "error" in r && (r as { error: unknown }).error) ok = false;
  } catch {
    ok = false;
  }
  return { label, ms: Math.round(performance.now() - start), ok };
}

/** Mide, uno detrás del otro, los pasos que hace cada página. */
export async function measure(supabase: Client): Promise<{ region: string; timings: Timing[] }> {
  const timings: Timing[] = [];
  timings.push(await time("Verificar la sesión (local)", () => supabase.auth.getClaims()));
  timings.push(await time("Verificar la sesión (servidor de Supabase)", () => supabase.auth.getUser()));
  timings.push(await time("Consulta simple a la base", () => supabase.from("app_settings").select("key").limit(1)));
  timings.push(await time("Permisos (my_access)", () => supabase.rpc("my_access")));
  timings.push(await time("Grilla completa", () => supabase.from("class_groups").select("id, schedules:class_schedules(id)")));
  timings.push(await time("Consulta simple, otra vez", () => supabase.from("app_settings").select("key").limit(1)));
  return { region: process.env.VERCEL_REGION ?? "local", timings };
}
