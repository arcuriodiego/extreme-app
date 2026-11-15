import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/basics";
import { formatARS } from "@/domain/shared/money";
import { settlePayment } from "@/lib/mercadopago";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tu compra" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vuelta desde Mercado Pago: confirma el pago consultando a Mercado Pago (no a la dirección) y muestra cómo quedó. */
export default async function ResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ compra?: string; payment_id?: string; collection_id?: string; status?: string }>;
}) {
  const [, params] = await Promise.all([requireProfile(), searchParams]);
  const paymentId = params.payment_id ?? params.collection_id ?? "";
  if (/^\d{1,20}$/.test(paymentId)) await settlePayment(paymentId).catch(() => "error");

  const supabase = await createClient();
  const { data } = UUID.test(params.compra ?? "")
    ? await supabase.from("purchases").select("kind, description, amount_cents, status, session_id").eq("id", params.compra!).maybeSingle()
    : { data: null };
  const p = data as { kind: string; description: string; amount_cents: number; status: string; session_id: string | null } | null;

  const approved = p?.status === "approved";
  const review = p?.status === "review";
  const failed = !p || params.status === "rejected" || params.status === "null" || params.status === "failure";
  const title = approved ? "¡Listo, pago aprobado!" : review ? "Pago recibido" : failed && !approved ? "No se completó el pago" : "Pago en proceso";
  const next =
    p?.kind === "pack"
      ? { href: "/clases", label: "Reservar mis clases" }
      : p?.kind === "single_class"
        ? { href: "/pases", label: "Ver mi reserva" }
        : p?.kind === "workshop"
          ? { href: "/clases", label: "Ver el workshop" }
          : { href: "/pagos", label: "Ver mis pagos" };

  return (
    <>
      <PageHeader title={title} />
      {p && (
        <section className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-line p-5">
          <span className="font-semibold">{p.description}</span>
          <span className="font-display text-2xl font-bold">{formatARS(Number(p.amount_cents))}</span>
        </section>
      )}
      <p className="text-[15px] leading-snug text-muted">
        {approved
          ? p?.kind === "pack"
            ? "Tu pack ya está cargado: reservá tus clases desde Clases."
            : p?.kind === "single_class"
              ? "Tu clase quedó reservada. ¡Te esperamos!"
              : p?.kind === "workshop"
                ? "Ya estás inscripto en el workshop."
                : "Tu cuota quedó paga. El recibo está en Pagos."
          : review
            ? "Recibimos el pago, pero no pudimos completar la compra (por ejemplo, la clase se llenó mientras pagabas). Recepción te va a contactar para darte otra fecha o devolverte la plata."
            : failed
              ? "El pago no se hizo. Podés volver a intentarlo o pagar en recepción."
              : "Mercado Pago todavía está procesando el pago. Apenas se acredite, se completa solo: no hace falta que hagas nada."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={approved ? next.href : "/pagos#comprar"} className="rounded-full bg-ink px-5 py-2.5 font-bold text-paper no-underline hover:text-paper">
          {approved ? next.label : "Volver a Compras"}
        </Link>
        <Link href="/inicio" className="self-center text-sm font-semibold">
          Ir a Inicio
        </Link>
      </div>
    </>
  );
}
