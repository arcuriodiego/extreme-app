import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/basics";
import { formatARS } from "@/domain/shared/money";
import { academyToday } from "@/lib/grilla";
import { methodLabel } from "@/domain/billing/payments";
import { getActiveStudent } from "@/lib/active-student";
import { ensureCharges, loadCharges, loadPayments, loadSurcharge } from "@/lib/billing";
import { nonCashPrice } from "@/domain/billing/cash-price";
import { loadPlans } from "@/lib/prices";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pagos" };

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function PagosPage() {
  const today = academyToday();
  await requireProfile();
  const supabase = await createClient();
  const [allPlans, { active }, surcharge] = await Promise.all([
    loadPlans(supabase, today).catch(() => []),
    getActiveStudent(),
    loadSurcharge(supabase).catch(() => 0),
    ensureCharges(supabase),
  ]);
  const studentId = active?.id ?? null;
  const child = active !== null && !active.isSelf;
  const plans = allPlans.filter((p) => p.active && p.current);
  const charges = studentId ? await loadCharges(supabase, studentId).catch(() => []) : [];
  const payments = studentId ? await loadPayments(supabase, studentId).catch(() => []) : [];
  const owed = charges.filter((c) => c.pendingCents > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const fmt = (d: string) => d.split("-").reverse().join("/");

  return (
    <>
      <PageHeader title={child ? `Pagos de ${active.firstName}` : "Pagos"} />
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">{child ? "Lo que debe" : "Lo que debés"}</h2>
        {owed.length === 0 ? (
          <p className="rounded-xl bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-ink">
            <span aria-hidden="true">✓ </span>{child ? "No tiene nada pendiente." : "No tenés nada pendiente."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {owed.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{c.description}</span>
                  <span className="text-sm text-muted">
                    {c.dueDate < today ? `Venció el ${fmt(c.dueDate)}` : `Vence el ${fmt(c.dueDate)}`}
                    {c.paidCents > 0 ? ` · Ya pagaste ${formatARS(c.paidCents)}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <strong className="font-display text-2xl">{formatARS(c.pendingCents)}</strong>
                  {c.cashCents !== null && <span className="text-sm text-muted">{formatARS(c.cashCents)} en efectivo</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted">
          Por ahora se paga en recepción: efectivo, transferencia, QR de cualquier billetera o tarjeta. Pagando en efectivo en recepción tenés
          descuento. Muy pronto, también desde la app.
        </p>
      </section>

      {payments.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Tus pagos</h2>
          <ul className="flex flex-col">
            {payments
              .filter((p) => p.status === "approved")
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[15px]">
                  <span className="flex flex-col">
                    <span>{p.concepts[0] ?? "Pago"}</span>
                    <span className="text-sm text-muted">
                      {fmt(p.date)} · {methodLabel(p.method)}
                    </span>
                  </span>
                  <strong>{formatARS(p.amountCents)}</strong>
                </li>
              ))}
          </ul>
        </section>
      )}

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
                      Desde el {dateFormat.format(new Date(`${p.next.validFrom}T12:00:00Z`))}: {formatARS(nonCashPrice(p.next.amountCents, surcharge))}
                      {surcharge > 0 ? ` (${formatARS(p.next.amountCents)} en efectivo)` : ""}
                    </span>
                  )}
                </span>
                {p.current && (
                  <span className="flex shrink-0 flex-col items-end">
                    <strong className="font-display text-2xl">{formatARS(nonCashPrice(p.current.amountCents, surcharge))}</strong>
                    {surcharge > 0 && <span className="text-sm text-muted">{formatARS(p.current.amountCents)} en efectivo</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
