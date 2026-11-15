"use server";

import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { isPurchaseKind } from "@/domain/payments/mercadopago";
import { checkProof } from "@/domain/payments/messages";
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

/**
 * "Ya transferí": crea la compra por transferencia con el comprobante adjunto.
 * Recepción la confirma (o rechaza) desde Gestión → Pagos → Transferencias.
 */
export async function submitTransfer(formData: FormData): Promise<void> {
  const kind = formData.get("kind");
  const ref = String(formData.get("ref") ?? "");
  const here = `/compras/transferencia?kind=${String(kind)}&ref=${ref}`;
  const fail = (error: string): never => redirect(`${here}&error=${error}`);
  if (!isPurchaseKind(kind) || !UUID.test(ref)) redirect("/pagos?error=compra-datos#comprar");
  const entry = formData.get("proof");
  const proof = checkProof(entry instanceof File ? entry : null);
  if (!proof.ok) fail(proof.error);

  const [{ active }, supabase] = await Promise.all([getActiveStudent(), createClient()]);
  if (!active) fail("compra-sin-alumno");
  const { data, error } = await supabase.rpc("create_purchase", { p_kind: kind, p_student_id: active.id, p_ref: ref, p_channel: "transfer" });
  if (error) {
    const msg = error.message ?? "";
    fail(/completa|lugar/i.test(msg) ? "compra-completa" : error.code === "42501" ? "compra-sin-permiso" : error.code === "23505" ? "compra-repetida" : "compra-no-disponible");
  }
  const purchaseId = (data as { id: string }).id;
  const { data: row } = await supabase.from("purchases").select("academy_id").eq("id", purchaseId).maybeSingle();
  const academyId = (row as { academy_id: string } | null)?.academy_id;
  const file = entry as File;
  const ext = (proof as { ok: true; ext: string }).ext;
  const path = `${academyId}/${purchaseId}/${randomBytes(12).toString("base64url")}.${ext}`;
  const up = academyId ? await supabase.storage.from("comprobantes").upload(path, file, { contentType: file.type, upsert: false }) : { error: true };
  if (up.error) fail("comprobante-subida");
  const { error: saveError } = await supabase.rpc("set_transfer_proof", { p_purchase_id: purchaseId, p_path: path });
  if (saveError) fail("comprobante-subida");
  redirect("/pagos?aviso=transferencia-enviada#comprar");
}
