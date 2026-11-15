import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, SubmitButton } from "@/components/forms/fields";
import { PageHeader } from "@/components/ui/basics";
import { otherPrice } from "@/domain/billing/cash-price";
import { hasTransferInfo, transferLines } from "@/domain/billing/whatsapp";
import { longDate } from "@/domain/classes/sessions";
import { isPurchaseKind } from "@/domain/payments/mercadopago";
import { PURCHASE_ERRORS } from "@/domain/payments/messages";
import { formatARS } from "@/domain/shared/money";
import { getActiveStudent } from "@/lib/active-student";
import { loadCharges, loadSurcharge } from "@/lib/billing";
import { academyToday } from "@/lib/grilla";
import { loadPlans } from "@/lib/prices";
import { loadTransferInfo } from "@/lib/receipts";
import { requireProfile } from "@/lib/session";
import { loadSession } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";
import { loadWorkshops } from "@/lib/workshops";
import { submitTransfer } from "../actions";

export const metadata: Metadata = { title: "Pagar por transferencia" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pagar por transferencia (Cuenta DNI, cualquier banco o billetera) y adjuntar el comprobante. */
export default async function TransferenciaPage({ searchParams }: { searchParams: Promise<{ kind?: string; ref?: string; error?: string }> }) {
  const [, q, { active }] = await Promise.all([requireProfile(), searchParams, getActiveStudent()]);
  const kind = q.kind;
  const ref = q.ref ?? "";
  const supabase = await createClient();
  const today = academyToday();
  const [transfer, surcharge] = await Promise.all([loadTransferInfo(supabase).catch(() => null), loadSurcharge(supabase).catch(() => 0)]);

  let title: string | null = null;
  let amount: number | null = null;
  if (isPurchaseKind(kind) && UUID.test(ref)) {
    if (kind === "pack" || kind === "single_class") {
      const plans = await loadPlans(supabase, today).catch(() => []);
      const plan = kind === "pack" ? plans.find((p) => p.id === ref) : plans.find((p) => p.kind === "single_class" && p.active);
      if (plan?.current) amount = otherPrice(plan.current.amountCents, surcharge, plan.current.otherCents);
      if (kind === "pack") title = plan?.name ?? null;
      else {
        const s = await loadSession(supabase, ref);
        title = s ? `Clase suelta · ${longDate(s.date)} ${s.start} · ${s.title}` : null;
      }
    } else if (kind === "membership_charge" && active) {
      const c = (await loadCharges(supabase, active.id).catch(() => [])).find((x) => x.id === ref);
      title = c?.description ?? null;
      amount = c?.pendingCents ?? null;
    } else if (kind === "workshop") {
      const w = (await loadWorkshops(supabase).catch(() => [])).find((x) => x.id === ref);
      title = w ? `Workshop · ${w.title}` : null;
      amount = w?.nonCashPriceCents ?? null;
    }
  }
  const ok = title !== null && amount !== null;
  const lines = transferLines(transfer);

  return (
    <>
      <Link href="/pagos#comprar" className="self-start text-sm font-semibold">
        ‹ Compras
      </Link>
      <PageHeader title="Pagar por transferencia" subtitle={active && !active.isSelf ? `Para ${active.name}` : undefined} />
      {q.error && PURCHASE_ERRORS[q.error] && <FormAlert kind="error">{PURCHASE_ERRORS[q.error]}</FormAlert>}
      {!ok ? (
        <p className="text-[15px] text-muted">Eso ya no está disponible. Volvé a Compras.</p>
      ) : !hasTransferInfo(transfer) ? (
        <FormAlert kind="error">{PURCHASE_ERRORS["sin-datos-transferencia"]}</FormAlert>
      ) : (
        <>
          <section className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-line p-5">
            <span className="font-semibold">{title}</span>
            <span className="font-display text-3xl font-bold">{formatARS(amount!)}</span>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-bold uppercase tracking-wide">1 · Transferí</h2>
            <p className="text-sm text-muted">Desde Cuenta DNI, cualquier banco o billetera, el monto exacto a:</p>
            <div className="flex flex-col gap-1 rounded-xl bg-surface p-4">
              {lines.map((l) => (
                <span key={l} className="select-all text-[15px]">
                  {l}
                </span>
              ))}
            </div>
          </section>
          <form action={submitTransfer} className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-bold uppercase tracking-wide">2 · Mandanos el comprobante</h2>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="ref" value={ref} />
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Captura o PDF del comprobante
              <input
                type="file"
                name="proof"
                required
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="rounded-xl border border-edge bg-paper p-3 text-base"
              />
            </label>
            <SubmitButton pendingText="Enviando…">Enviar comprobante</SubmitButton>
            <p className="text-sm text-muted">
              Recepción revisa que haya entrado y lo confirma: ahí se activa {kind === "pack" ? "tu pack" : kind === "single_class" ? "tu reserva" : kind === "workshop" ? "tu inscripción" : "el pago de tu cuota"}.
              {kind === "single_class" ? " El lugar no queda guardado hasta que se confirme." : ""}
            </p>
          </form>
        </>
      )}
    </>
  );
}
