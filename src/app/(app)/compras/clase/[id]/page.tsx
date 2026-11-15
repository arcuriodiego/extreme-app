import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { PageHeader } from "@/components/ui/basics";
import { otherPrice } from "@/domain/billing/cash-price";
import { longDate, teacherShown } from "@/domain/classes/sessions";
import { PURCHASE_ERRORS } from "@/domain/payments/messages";
import { formatARS } from "@/domain/shared/money";
import { getActiveStudent } from "@/lib/active-student";
import { loadSurcharge } from "@/lib/billing";
import { academyToday } from "@/lib/grilla";
import { mpConfigured } from "@/lib/mercadopago";
import { loadPlans } from "@/lib/prices";
import { requireProfile } from "@/lib/session";
import { loadSession } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";
import { startPurchase } from "../../actions";

export const metadata: Metadata = { title: "Comprar clase" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Confirmar la compra de una clase suelta (una fecha) y pagar con Mercado Pago. */
export default async function ComprarClasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [, { id }, query, { active }] = await Promise.all([requireProfile(), params, searchParams, getActiveStudent()]);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [session, plans, surcharge] = await Promise.all([loadSession(supabase, id), loadPlans(supabase, academyToday()).catch(() => []), loadSurcharge(supabase).catch(() => 0)]);
  if (!session) notFound();
  const plan = plans.find((p) => p.kind === "single_class" && p.active && p.current);
  const cash = plan?.current?.amountCents ?? null;
  const other = plan?.current ? otherPrice(plan.current.amountCents, surcharge, plan.current.otherCents) : null;
  const ready = mpConfigured();
  const back = `/compras/clase/${id}`;

  return (
    <>
      <Link href={`/clases/clase/${id}`} className="self-start text-sm font-semibold">
        ‹ Volver a la clase
      </Link>
      <PageHeader title="Clase suelta" subtitle={active && !active.isSelf ? `Para ${active.name}` : undefined} />
      {query.error && PURCHASE_ERRORS[query.error] && <FormAlert kind="error">{PURCHASE_ERRORS[query.error]}</FormAlert>}
      <section className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-line p-5">
        <span className="font-display text-lg font-bold uppercase tracking-wide text-brand-text">{longDate(session.date)}</span>
        <span className="font-semibold">{session.title}</span>
        <span className="text-sm text-muted">
          {session.start} a {session.end} · {teacherShown(session)} · {session.roomName}
        </span>
      </section>
      {other !== null && cash !== null ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px]">Total con Mercado Pago</span>
            <strong className="font-display text-3xl">{formatARS(other)}</strong>
          </div>
          {ready ? (
            <form action={startPurchase} className="flex flex-col gap-2">
              <input type="hidden" name="kind" value="single_class" />
              <input type="hidden" name="ref" value={id} />
              <input type="hidden" name="back" value={back} />
              <SmallSubmit tone="dark">Pagar con Mercado Pago</SmallSubmit>
              <span className="text-sm text-muted">Al aprobarse el pago, la clase queda reservada.</span>
            </form>
          ) : (
            <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">Muy pronto vas a poder pagar desde la app. Por ahora, reservala en recepción.</p>
          )}
          <p className="text-sm text-muted">En recepción, en efectivo: {formatARS(cash)}.</p>
        </section>
      ) : (
        <p className="text-[15px] text-muted">La clase suelta no tiene precio cargado. Consultá en recepción.</p>
      )}
    </>
  );
}
