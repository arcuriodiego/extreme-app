import "server-only";
import { createHash } from "node:crypto";
import { academyConfig } from "@/config/academy";
import { noticeEmail } from "@/domain/notices/email";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

interface PendingEmail {
  id: string;
  email: string;
  first_name: string | null;
  title: string;
  body: string;
  link: string | null;
}

/**
 * Manda por email los avisos pendientes (de a tandas de hasta 50, por la API de Resend).
 * Se llama después de responder la página, así nunca demora la app.
 * Sin RESEND_API_KEY no hace nada (los avisos siguen en la app).
 */
export async function deliverNotificationEmails(supabase: Client): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return 0;

  const { data, error } = await supabase.rpc("claim_notification_emails", { p_limit: 50 });
  if (error || !data || (data as PendingEmail[]).length === 0) return 0;
  const batch = data as PendingEmail[];

  const payload = batch.map((n) => {
    const e = noticeEmail({ firstName: n.first_name, title: n.title, body: n.body, link: n.link }, academyConfig.appUrl, academyConfig.name);
    return {
      from: academyConfig.emailFrom,
      to: [n.email],
      reply_to: academyConfig.emailReplyTo,
      subject: e.subject,
      html: e.html,
      text: e.text,
    };
  });

  let ok = false;
  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Si el mismo lote se reintenta, Resend no lo manda dos veces.
        "Idempotency-Key": `avisos-${createHash("sha256").update(batch.map((n) => n.id).sort().join(",")).digest("hex")}`,
      },
      body: JSON.stringify(payload),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }

  const ids = batch.map((n) => n.id);
  await supabase.rpc("finish_notification_emails", { p_sent: ok ? ids : [], p_failed: ok ? [] : ids });
  return batch.length;
}
