"use server";

import { redirect } from "next/navigation";
import { isPurchaseKind } from "@/domain/payments/mercadopago";
import { getActiveStudent } from "@/lib/active-student";
import { createPreference, mpConfigured } from "@/lib/mercadopago";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(formData: FormData, error: string): never {
  const to = String(formData.get("back") ?? "");
  const path = to.startsWith("/pagos") || to.startsWith("/compras") || to.startsWith("/clases") ? to.split("?")[0] : "/pagos";
  redirect(`${path}?error=${error}#comprar`);
}

/**
 * Comprar con Mercado Pago: la base crea la compra con su precio (otros medios),
 * se arma el pago en Mercado Pago y se manda al alumno a pagar.
 */
export async function startPurchase(formData: FormData): Promise<void> {
  const kind = formData.get("kind");
  const ref = String(formData.get("ref") ?? "");
  if (!isPurchaseKind(kind) || !UUID.test(ref)) back(formData, "compra-datos");
  if (!mpConfigured()) back(formData, "mp-no-disponible");

  const [profile, { active }, supabase] = await Promise.all([requireProfile(), getActiveStudent(), createClient()]);
  if (!active) back(formData, "compra-sin-alumno");
  const { data, error } = await supabase.rpc("create_purchase", { p_kind: kind, p_student_id: active.id, p_ref: ref });
  if (error) {
    const msg = error.message ?? "";
    back(formData, /completa|lugar/i.test(msg) ? "compra-completa" : error.code === "42501" ? "compra-sin-permiso" : error.code === "23505" ? "compra-repetida" : "compra-no-disponible");
  }
  const purchase = data as { id: string; amount_cents: number; description: string };
  const who = active.isSelf ? "" : ` (${active.firstName})`;
  const pref = await createPreference({
    purchaseId: purchase.id,
    title: `Extreme Dance · ${purchase.description}${who}`,
    amountCents: Number(purchase.amount_cents),
    payerEmail: profile.email,
  });
  if (!pref) back(formData, "mp-error");
  await supabase.rpc("set_purchase_preference", { p_purchase_id: purchase.id, p_preference_id: pref.id });
  redirect(pref.url);
}
