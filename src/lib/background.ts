import "server-only";
import { after } from "next/server";
import { deliverNotificationEmails } from "@/lib/email-delivery";
import { deliverNotificationPushes } from "@/lib/push-delivery";
import { ensureNotifications } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

/**
 * Tareas que corren después de responder cada pantalla (no la demoran):
 * genera los avisos del día si faltan y manda los pendientes por email y al celular.
 */
export async function runBackgroundTasks(): Promise<void> {
  // El cliente se crea ahora (lee las cookies del pedido); se usa después de responder.
  const supabase = await createClient();
  after(async () => {
    try {
      await ensureNotifications(supabase);
      await Promise.all([deliverNotificationEmails(supabase), deliverNotificationPushes(supabase)]);
    } catch {
      // Si falla, se reintenta en la próxima pantalla.
    }
  });
}
