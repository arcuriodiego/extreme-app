import { verifyMpSignature } from "@/domain/payments/mercadopago";
import { settlePayment } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

/**
 * Aviso de Mercado Pago cuando cambia un pago. No confía en el contenido:
 * con el número de pago, consulta a Mercado Pago y recién ahí cumple la compra.
 * Si hay clave de notificación (MP_WEBHOOK_SECRET), además verifica la firma.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let body: { type?: string; data?: { id?: string | number } } = {};
  try {
    body = await request.json();
  } catch {
    // Algunos avisos vienen sólo con parámetros en la dirección.
  }
  const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (type !== "payment" || !/^\d{1,20}$/.test(dataId)) return Response.json({ ok: true, ignorado: true });

  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  if (secret) {
    const valid = verifyMpSignature({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId: url.searchParams.get("data.id") ?? dataId,
      secret,
    });
    if (!valid) return Response.json({ ok: false }, { status: 401 });
  }

  const result = await settlePayment(dataId);
  if (result === "error") return Response.json({ ok: false }, { status: 500 });
  return Response.json({ ok: true, resultado: result });
}
