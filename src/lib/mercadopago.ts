import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { academyConfig } from "@/config/academy";
import { centsToPesos, pesosToCents } from "@/domain/payments/mercadopago";
import { supabaseEnv } from "@/lib/supabase/env";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const API = "https://api.mercadopago.com";

function token(): string | null {
  return process.env.MP_ACCESS_TOKEN?.trim() || null;
}

/** ¿Está cargada la credencial de Mercado Pago (en Vercel)? Sin ella, la app ofrece pagar en recepción. */
export function mpConfigured(): boolean {
  return token() !== null && Boolean(process.env.SUPABASE_SECRET_KEY?.trim());
}

/** Credenciales de prueba (TEST-…): se paga con usuarios y tarjetas de prueba. */
export function mpTestMode(): boolean {
  return token()?.startsWith("TEST-") ?? false;
}

/** Crea la preferencia de Checkout Pro y devuelve el enlace de pago. */
export async function createPreference(input: {
  purchaseId: string;
  title: string;
  amountCents: number;
  payerEmail: string;
}): Promise<{ id: string; url: string } | null> {
  const t = token();
  if (!t) return null;
  const back = `${academyConfig.appUrl}/compras/resultado?compra=${input.purchaseId}`;
  const res = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json", "x-idempotency-key": input.purchaseId },
    body: JSON.stringify({
      items: [{ id: input.purchaseId, title: input.title.slice(0, 120), quantity: 1, currency_id: "ARS", unit_price: centsToPesos(input.amountCents) }],
      external_reference: input.purchaseId,
      payer: input.payerEmail ? { email: input.payerEmail } : undefined,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: "approved",
      notification_url: `${academyConfig.appUrl}/api/mercadopago/webhook`,
      statement_descriptor: "EXTREME DANCE",
      // Una hora para pagar: después la compra se vuelve a armar (precio y lugar al día).
      expires: true,
      expiration_date_to: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string };
  const url = mpTestMode() ? (data.sandbox_init_point ?? data.init_point) : data.init_point;
  return data.id && url ? { id: data.id, url } : null;
}

interface MpPayment {
  id: number;
  status: string;
  transaction_amount: number;
  external_reference: string | null;
}

async function getPayment(paymentId: string): Promise<MpPayment | null> {
  const t = token();
  if (!t || !/^\d{1,20}$/.test(paymentId)) return null;
  const res = await fetch(`${API}/v1/payments/${paymentId}`, { headers: { authorization: `Bearer ${t}` }, cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as MpPayment;
}

function serviceClient(): Client | null {
  const env = supabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!env || !secret) return null;
  return createSupabaseClient(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as Client;
}

/**
 * Consulta el pago en Mercado Pago (nunca confía en lo que llega por la URL o el aviso)
 * y, si está aprobado, cumple la compra. Idempotente: se puede llamar varias veces.
 */
export async function settlePayment(paymentId: string): Promise<"approved" | "review" | "pending" | "rejected" | "error"> {
  const payment = await getPayment(paymentId);
  if (!payment || !payment.external_reference) return "error";
  if (payment.status !== "approved") return payment.status === "rejected" || payment.status === "cancelled" ? "rejected" : "pending";
  const supabase = serviceClient();
  if (!supabase) return "error";
  const { data, error } = await supabase.rpc("fulfill_purchase", {
    p_purchase_id: payment.external_reference,
    p_mp_payment_id: String(payment.id),
    p_amount_cents: pesosToCents(payment.transaction_amount),
  });
  if (error) return "error";
  return data === "review" ? "review" : "approved";
}
