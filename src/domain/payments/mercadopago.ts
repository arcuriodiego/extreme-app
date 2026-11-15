import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma de los avisos de Mercado Pago (encabezado x-signature: "ts=…,v1=…").
 * El texto firmado es "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con HMAC-SHA256
 * y la clave secreta de la notificación. Los ids alfanuméricos van en minúscula.
 */
export function verifyMpSignature({
  signature,
  requestId,
  dataId,
  secret,
}: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  if (!signature || !dataId || !secret) return false;
  const parts = Object.fromEntries(
    signature.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k ?? "", v.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  let manifest = `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1.toLowerCase(), "hex"));
}

/** Pesos con centavos (como los pide y devuelve Mercado Pago) ↔ centavos enteros. */
export function centsToPesos(cents: number): number {
  return Math.round(cents) / 100;
}
export function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

export const PURCHASE_KINDS = ["pack", "single_class", "membership_charge", "workshop"] as const;
export type PurchaseKind = (typeof PURCHASE_KINDS)[number];
export function isPurchaseKind(value: unknown): value is PurchaseKind {
  return typeof value === "string" && (PURCHASE_KINDS as readonly string[]).includes(value);
}
