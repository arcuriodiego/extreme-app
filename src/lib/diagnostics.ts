import "server-only";
import { requireSupabaseEnv } from "@/lib/supabase/env";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface Timing {
  label: string;
  ms: number;
  ok: boolean;
  note?: string;
}

async function time(label: string, fn: () => PromiseLike<unknown>): Promise<Timing> {
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

/**
 * Un pedido "vacío" a Supabase, sin base de datos: mide sólo la distancia y la conexión.
 * Devuelve también el centro de Cloudflare por el que pasó (últimas letras de cf-ray).
 */
async function ping(label: string): Promise<Timing> {
  const { url, anonKey } = requireSupabaseEnv();
  const start = performance.now();
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health?t=${Math.random()}`, {
      headers: { apikey: anonKey },
      cache: "no-store",
    });
    await res.text();
    const ray = res.headers.get("cf-ray")?.split("-").pop();
    return { label, ms: Math.round(performance.now() - start), ok: res.ok, note: ray ? `vía ${ray}` : undefined };
  } catch {
    return { label, ms: Math.round(performance.now() - start), ok: false };
  }
}

/** Mide, uno detrás del otro, la red hasta Supabase y los pasos que hace cada página. */
export async function measure(supabase: Client): Promise<{ region: string; timings: Timing[] }> {
  const timings: Timing[] = [];
  timings.push(await ping("Red hasta Supabase (1)"));
  timings.push(await ping("Red hasta Supabase (2)"));
  timings.push(await ping("Red hasta Supabase (3)"));
  timings.push(await time("Verificar la sesión (local)", () => supabase.auth.getClaims()));
  timings.push(await time("Verificar la sesión (servidor de Supabase)", () => supabase.auth.getUser()));
  // Consultas distintas entre sí, para que ninguna reutilice el resultado de otra.
  timings.push(await time("Consulta a la base (1)", () => supabase.from("app_settings").select("key").eq("key", "grace_days")));
  timings.push(await time("Consulta a la base (2)", () => supabase.from("app_settings").select("key").eq("key", "cancel_hours")));
  timings.push(await time("Consulta a la base (3)", () => supabase.from("app_settings").select("key").eq("key", "credit_days")));
  timings.push(await time("Permisos (my_access)", () => supabase.rpc("my_access")));
  timings.push(await time("Grilla completa", () => supabase.from("class_groups").select("id, schedules:class_schedules(id)")));
  return { region: process.env.VERCEL_REGION ?? "local", timings };
}
