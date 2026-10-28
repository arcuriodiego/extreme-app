"use server";

import type { SubscriptionInput } from "@/domain/push/push";
import { requireProfile } from "@/lib/session";
import { sendTestPush } from "@/lib/push-delivery";
import { createClient } from "@/lib/supabase/server";

/** Guarda la suscripción de este celular para la persona que inició sesión. */
export async function savePushSubscription(input: SubscriptionInput): Promise<{ ok: boolean }> {
  if (!/^https:\/\//.test(input.endpoint) || input.endpoint.length > 1000) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_user_agent: input.userAgent.slice(0, 300),
  });
  return { ok: !error };
}

export async function deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_push_subscription", { p_endpoint: endpoint });
  return { ok: !error };
}

export async function testPush(): Promise<{ sent: number; total: number } | null> {
  const profile = await requireProfile();
  return sendTestPush(await createClient(), profile.id);
}
