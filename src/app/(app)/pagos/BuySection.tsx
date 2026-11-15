import Link from "next/link";
import { SmallSubmit } from "@/components/forms/fields";
import { otherPrice } from "@/domain/billing/cash-price";
import { formatARS } from "@/domain/shared/money";
import type { ChargeRow } from "@/lib/billing";
import type { PlanWithPrices } from "@/lib/prices";
import type { WorkshopRow } from "@/lib/workshops";
import { startPurchase } from "../compras/actions";

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });

function BuyRow({
  title,
  detail,
  priceCents,
  cashCents,
  kind,
  refId,
  ready,
  transfer,
  label = "Pagar con Mercado Pago",
}: {
  title: string;
  detail: string;
  priceCents: number;
  cashCents: number | null;
  kind: string;
  refId: string;
  ready: boolean;
  /** Se puede pagar por transferencia (la academia cargó sus datos). */
  transfer: boolean;
  label?: string;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-paper/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">{title}</span>
          <span className="text-sm text-muted">{detail}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <strong className="font-display text-2xl">{formatARS(priceCents)}</strong>
          {cashCents !== null && cashCents < priceCents && <span className="text-xs text-muted">{formatARS(cashCents)} efectivo en recepción</span>}
        </span>
      </div>
      {(ready || transfer) && (
        <div className="flex flex-wrap items-center gap-3">
          {ready && (
            <form action={startPurchase}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="ref" value={refId} />
              <input type="hidden" name="back" value="/pagos" />
              <SmallSubmit tone="dark">{label}</SmallSubmit>
            </form>
          )}
          {transfer && (
            <Link href={`/compras/transferencia?kind=${kind}&ref=${refId}`} className="text-sm font-semibold">
              Pagar por transferencia ›
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * "Comprar": cuota pendiente, packs, clase suelta y workshops, con Mercado Pago.
 * Mientras no esté cargada la credencial, muestra los precios y cómo pagar en recepción.
 */
export function BuySection({
  ready,
  transfer,
  canBuy,
  who,
  owedMemberships,
  packs,
  single,
  workshops,
  surcharge,
}: {
  ready: boolean;
  transfer: boolean;
  canBuy: boolean;
  who: string | null;
  owedMemberships: ChargeRow[];
  packs: PlanWithPrices[];
  single: PlanWithPrices | null;
  workshops: WorkshopRow[];
  surcharge: number;
}) {
  const live = ready && canBuy;
  const byTransfer = transfer && canBuy;
  return (
    <section id="comprar" className="flex scroll-mt-20 flex-col gap-4">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">{who ? `Comprar para ${who}` : "Comprar"}</h2>
      {!ready && !transfer && (
        <p className="rounded-xl bg-surface px-4 py-3 text-[15px] leading-snug">
          Muy pronto vas a poder pagar desde la app con Mercado Pago. Por ahora, se paga en recepción.
        </p>
      )}
      {transfer && (
        <p className="text-sm text-muted">
          {ready ? "Pagá con Mercado Pago (se acredita al instante) o por transferencia desde Cuenta DNI, cualquier banco o billetera." : "Pagá por transferencia desde Cuenta DNI, cualquier banco o billetera, y mandanos el comprobante desde acá."}
        </p>
      )}

      {owedMemberships.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Tu cuota</h3>
          <ul className="flex flex-col gap-2">
            {owedMemberships.map((c) => (
              <BuyRow
                key={c.id}
                title={c.description}
                detail={`Vence el ${dateFormat.format(new Date(`${c.dueDate}T12:00:00Z`))}`}
                priceCents={c.pendingCents}
                cashCents={c.cashCents}
                kind="membership_charge"
                refId={c.id}
                ready={live}
                transfer={byTransfer}
                label="Pagar la cuota"
              />
            ))}
          </ul>
        </div>
      )}

      {packs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Packs de clases</h3>
          <ul className="flex flex-col gap-2">
            {packs.map((p) => (
              <BuyRow
                key={p.id}
                title={p.name}
                detail={p.description || "Para usar en 1 mes, con cualquier profe y estilo"}
                priceCents={otherPrice(p.current!.amountCents, surcharge, p.current!.otherCents)}
                cashCents={p.current!.amountCents}
                kind="pack"
                refId={p.id}
                ready={live}
                transfer={byTransfer}
                label="Comprar pack"
              />
            ))}
          </ul>
        </div>
      )}

      {single && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Clase suelta</h3>
          <Link
            href="/clases"
            className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-paper/80 p-4 text-ink no-underline hover:border-ink hover:text-ink"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">Elegí la clase y la fecha</span>
              <span className="text-sm text-muted">
                {formatARS(otherPrice(single.current!.amountCents, surcharge, single.current!.otherCents))} · {formatARS(single.current!.amountCents)} efectivo
                en recepción
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </div>
      )}

      {workshops.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Workshops</h3>
          <ul className="flex flex-col gap-2">
            {workshops.map((w) => (
              <BuyRow
                key={w.id}
                title={w.title}
                detail={`${w.firstStart ? dateFormat.format(new Date(w.firstStart)) : ""}${w.teacherName ? ` · ${w.teacherName}` : ""}`}
                priceCents={w.nonCashPriceCents}
                cashCents={w.priceCents}
                kind="workshop"
                refId={w.id}
                ready={live}
                transfer={byTransfer}
                label="Inscribirme y pagar"
              />
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-muted">
        La cuota mensual nueva (lugar fijo en 2 clases por semana) se pide desde <Link href="/inscripcion">Inscripción</Link>: el primer pago se hace
        en recepción.
      </p>
    </section>
  );
}
