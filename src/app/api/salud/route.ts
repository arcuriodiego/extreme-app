import { academyConfig } from "@/config/academy";
import { supabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * Estado público y mínimo de la app: entorno, región del servidor y si llega a la base.
 * Sirve para verificar una publicación sin iniciar sesión. No muestra datos ni direcciones internas.
 */
export async function GET() {
  const env = supabaseEnv();
  let base: "ok" | "sin-configurar" | "sin-respuesta" = env ? "sin-respuesta" : "sin-configurar";
  let ms: number | null = null;
  if (env) {
    const start = performance.now();
    try {
      const res = await fetch(`${env.url.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: env.anonKey }, cache: "no-store" });
      await res.text();
      if (res.ok) base = "ok";
    } catch {
      // queda "sin-respuesta"
    }
    ms = Math.round(performance.now() - start);
  }
  return Response.json(
    { entorno: academyConfig.env, region: process.env.VERCEL_REGION ?? "local", base, ms, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
