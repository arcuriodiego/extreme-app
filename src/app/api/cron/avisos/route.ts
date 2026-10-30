import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cronAuthorized } from "@/domain/cron/auth";
import { deliverNotificationEmails } from "@/lib/email-delivery";
import { deliverNotificationPushes } from "@/lib/push-delivery";
import { supabaseEnv } from "@/lib/supabase/env";
import type { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Aviso diario automático. Lo llama la tarea programada de Vercel (vercel.json → crons)
 * todas las mañanas, aunque nadie abra la app:
 * genera las cuotas y los avisos del día y manda los pendientes por email y al celular.
 * Usa la clave secreta de Supabase, que sólo existe en el servidor (variable SUPABASE_SECRET_KEY).
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  const env = supabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!env || !secretKey) {
    return Response.json({ ok: false, error: "falta configurar SUPABASE_SECRET_KEY" }, { status: 503 });
  }
  const supabase = createSupabaseClient(env.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as Client;

  const { data: generated, error } = await supabase.rpc("cron_daily_notifications");
  if (error) return Response.json({ ok: false, error: "no se pudieron generar los avisos" }, { status: 500 });

  // Despacha de a tandas (hasta 10 de cada tipo por corrida; lo que quede sale en la próxima).
  let emails = 0;
  let pushes = 0;
  for (let i = 0; i < 10; i++) {
    const n = await deliverNotificationEmails(supabase);
    emails += n;
    if (n === 0) break;
  }
  for (let i = 0; i < 10; i++) {
    const n = await deliverNotificationPushes(supabase);
    pushes += n;
    if (n === 0) break;
  }
  return Response.json({ ok: true, avisos: generated ?? 0, emails, pushes }, { headers: { "cache-control": "no-store" } });
}
