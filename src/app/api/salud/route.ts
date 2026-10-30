import { academyConfig } from "@/config/academy";
import { supabaseEnv } from "@/lib/supabase/env";
import { vapidStatus } from "@/lib/push-delivery";

export const dynamic = "force-dynamic";

/**
 * Estado público y mínimo de la app: entorno, región del servidor y si llega a la base.
 * Sirve para verificar una publicación sin iniciar sesión. No muestra datos ni direcciones internas.
 */
export async function GET() {
  const env = supabaseEnv();
  let base: "ok" | "sin-configurar" | "sin-respuesta" = env ? "sin-respuesta" : "sin-configurar";
  let ms: number | null = null;
  let status: number | null = null;
  let detalle: string | null = null;
  // Sólo la forma de los datos, nunca los valores.
  const formato = env
    ? {
        direccion: /^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(env.url) ? "ok" : "revisar",
        clave: env.anonKey.startsWith("sb_publishable_") ? "publishable" : env.anonKey.startsWith("eyJ") ? "anon" : env.anonKey.startsWith("sb_secret_") ? "SECRETA-NO-VA" : "revisar",
        espacios: env.url !== env.url.trim() || env.anonKey !== env.anonKey.trim(),
      }
    : null;
  if (env) {
    const start = performance.now();
    try {
      const res = await fetch(`${env.url.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: env.anonKey }, cache: "no-store" });
      await res.text();
      status = res.status;
      if (res.ok) base = "ok";
    } catch (e) {
      const code = e instanceof Error && e.cause && typeof e.cause === "object" && "code" in e.cause ? String(e.cause.code) : null;
      detalle = code ?? (e instanceof Error ? e.name : "error");
    }
    ms = Math.round(performance.now() - start);
  }
  return Response.json(
    { entorno: academyConfig.env, region: process.env.VERCEL_REGION ?? "local", base, ms, status, detalle, formato, avisos: { email: process.env.RESEND_API_KEY?.trim().startsWith("re_") ? "ok" : "falta", push: vapidStatus() }, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
