import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/basics";
import { formatARS } from "@/domain/shared/money";
import { academyToday } from "@/lib/grilla";
import { loadPlans } from "@/lib/prices";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pagos" };

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function PagosPage() {
  const today = academyToday();
  let plans: Awaited<ReturnType<typeof loadPlans>> = [];
  try {
    plans = (await loadPlans(await createClient(), today)).filter((p) => p.active && p.current);
  } catch {
    plans = [];
  }

  return (
    <>
      <PageHeader title="Pagos" />
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-5">
        <span className="self-start rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold tracking-wide text-white">PRÓXIMAMENTE</span>
        <p className="text-[15px] leading-snug">
          Muy pronto vas a poder pagar con Mercado Pago y ver acá el estado de tu cuota y tus comprobantes.
        </p>
      </section>

      {plans.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Precios</h2>
          <ul className="flex flex-col gap-2">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-sm text-muted">{p.description}</span>
                  {p.next && (
                    <span className="text-sm font-semibold text-warn-ink">
                      Desde el {dateFormat.format(new Date(`${p.next.validFrom}T12:00:00Z`))}: {formatARS(p.next.amountCents)}
                    </span>
                  )}
                </span>
                <strong className="shrink-0 font-display text-2xl">{p.current ? formatARS(p.current.amountCents) : ""}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
