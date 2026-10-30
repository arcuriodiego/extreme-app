import "server-only";
import webpush from "web-push";
import { academyConfig } from "@/config/academy";
import { isGoneStatus, isVapidPublicKey, pushPayload } from "@/domain/push/push";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

interface PendingPush {
  notification_id: string;
  title: string;
  body: string | null;
  link: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Qué falta de las claves VAPID (para la página de configuración; nunca muestra los valores). */
export function vapidStatus(): { publicKey: "ok" | "falta" | "invalida"; privateKey: "ok" | "falta" | "invalida" } {
  const pub = (process.env.VAPID_PUBLIC_KEY ?? "").trim().replace(/^["']|["']$/g, "");
  const priv = (process.env.VAPID_PRIVATE_KEY ?? "").trim().replace(/^["']|["']$/g, "");
  return {
    publicKey: !pub ? "falta" : isVapidPublicKey(pub) ? "ok" : "invalida",
    privateKey: !priv ? "falta" : /^[A-Za-z0-9_-]{40,50}$/.test(priv) ? "ok" : "invalida",
  };
}

/** Claves VAPID del servidor (Vercel). Sin ellas, no se mandan notificaciones (siguen la campanita y el email). */
export function vapidKeys(): { publicKey: string; privateKey: string } | null {
  const s = vapidStatus();
  if (s.publicKey !== "ok" || s.privateKey !== "ok") return null;
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY!.trim().replace(/^["']|["']$/g, ""),
    privateKey: process.env.VAPID_PRIVATE_KEY!.trim().replace(/^["']|["']$/g, ""),
  };
}

function options(keys: { publicKey: string; privateKey: string }) {
  return {
    vapidDetails: { subject: `mailto:${academyConfig.emailReplyTo}`, publicKey: keys.publicKey, privateKey: keys.privateKey },
    TTL: 60 * 60 * 24,
    urgency: "normal" as const,
  };
}

/** Manda al celular los avisos pendientes (de a tandas). Se llama después de responder la página. */
export async function deliverNotificationPushes(supabase: Client): Promise<number> {
  const keys = vapidKeys();
  if (!keys) return 0;

  const { data, error } = await supabase.rpc("claim_notification_pushes", { p_limit: 50 });
  if (error || !data || (data as PendingPush[]).length === 0) return 0;
  const rows = data as PendingPush[];

  const sent = new Set<string>();
  const failed = new Set<string>();
  const gone: string[] = [];
  await Promise.all(
    rows.map(async (r) => {
      const payload = JSON.stringify(pushPayload({ id: r.notification_id, title: r.title, body: r.body, link: r.link }));
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload, options(keys));
        sent.add(r.notification_id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (isGoneStatus(status)) gone.push(r.endpoint);
        else failed.add(r.notification_id);
      }
    }),
  );
  // Si llegó a algún celular de la persona, cuenta como enviada.
  const ids = [...new Set(rows.map((r) => r.notification_id))];
  await supabase.rpc("finish_notification_pushes", {
    p_sent: ids.filter((id) => sent.has(id)),
    p_failed: ids.filter((id) => !sent.has(id) && failed.has(id)),
    p_gone: gone,
  });
  return rows.length;
}

/** Notificación de prueba a los celulares propios (desde Perfil). Devuelve a cuántos llegó. */
export async function sendTestPush(supabase: Client, profileId: string): Promise<{ sent: number; total: number } | null> {
  const keys = vapidKeys();
  if (!keys) return null;
  const { data } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("profile_id", profileId);
  const subs = (data ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  const payload = JSON.stringify(
    pushPayload({ id: `prueba-${Date.now()}`, title: "¡Listo! Las notificaciones funcionan", body: "Así te van a llegar los avisos de la academia.", link: "/avisos" }),
  );
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options(keys));
        sent++;
      } catch (e) {
        if (isGoneStatus((e as { statusCode?: number }).statusCode)) gone.push(s.endpoint);
      }
    }),
  );
  for (const endpoint of gone) await supabase.rpc("delete_push_subscription", { p_endpoint: endpoint });
  return { sent, total: subs.length };
}
