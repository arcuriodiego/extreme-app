import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { cashSummary, methodLabel } from "@/domain/billing/payments";
import { longDate } from "@/domain/classes/sessions";
import { canOpen } from "@/domain/navigation/menus";
import { addDays, isValidCalendarDate, startOfDayInZone } from "@/domain/shared/calendar-date";
import { academyConfig } from "@/config/academy";
import { loadRefunds } from "@/lib/workshops";
import { formatARS } from "@/domain/shared/money";
import { voidPayment } from "@/app/(gestion)/admin/alumnos/actions";
import { ensureCharges, loadDayPayments, loadDebtors, loadGraceDays } from "@/lib/billing";
import { academyToday } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pagos" };

const NOTICES: Record<string, string> = { "pago-anulado": "Listo, anulamos el pago." };
const ERRORS: Record<string, string> = {
  "motivo-anulacion": "Escribí el motivo de la anulación.",
  "sin-permiso": "Sólo administración puede anular pagos.",
  "no-disponible": "Ese pago ya estaba anulado. Recargá la página.",
  generico: "No pudimos hacer el cambio. Probá de nuevo.",
};

export default async function PagosPage({ searchParams }: { searchParams: Promise<{ dia?: string; aviso?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "pagos")) return <NoAccess />;
  const canVoid = can(profile.access, "finance.view");

  const today = academyToday();
  const day = params.dia && isValidCalendarDate(params.dia) && params.dia <= today ? params.dia : today;

  const supabase = await createClient();
  const [, graceDays, payments, refunds] = await Promise.all([
    ensureCharges(supabase),
    loadGraceDays(supabase),
    loadDayPayments(supabase, day),
    loadRefunds(
      supabase,
      startOfDayInZone(day, academyConfig.timeZone).toISOString(),
      startOfDayInZone(addDays(day, 1), academyConfig.timeZone).toISOString(),
    ),
  ]);
  const refundsTotal = refunds.reduce((s, r) => s + r.amountCents, 0);
  const debtors = await loadDebtors(supabase, today, graceDays);
  const summary = cashSummary(payments);
  const grace = debtors.filter((d) => d.light.light === "grace");
  const suspended = debtors.filter((d) => d.light.light === "suspended");

  const notice = params.aviso ? NOTICES[params.aviso] : undefined;
  const failure = params.error ? ERRORS[params.error] : undefined;

  return (
    <>
      <PageHeader title="Pagos" subtitle="Para cobrar, abrí la ficha del alumno en Alumnos." />
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
              Caja · {day === today ? "Hoy" : longDate(day)}
            </h2>
            <nav aria-label="Cambiar de día" className="flex gap-3 text-sm font-semibold">
              <Link href={`/admin/pagos?dia=${addDays(day, -1)}`}>‹ Día anterior</Link>
              {day !== today && <Link href={`/admin/pagos?dia=${addDays(day, 1)}`}>Día siguiente ›</Link>}
            </nav>
          </div>

          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-ink p-5 text-white">
            <span className="text-sm font-semibold text-[#cfcfcf]">{refundsTotal > 0 ? "Neto del día" : "Total cobrado"}</span>
            <strong className="font-display text-4xl">{formatARS(summary.total - refundsTotal)}</strong>
            {refundsTotal > 0 && (
              <span className="text-sm text-[#cfcfcf]">
                Cobrado {formatARS(summary.total)} · Devuelto {formatARS(refundsTotal)}
              </span>
            )}
            {summary.byMethod.length > 0 && (
              <ul className="flex flex-col gap-1 border-t border-white/15 pt-2 text-[15px]">
                {summary.byMethod.map((m) => (
                  <li key={m.method} className="flex justify-between gap-3">
                    <span>
                      {m.label} <span className="text-[#cfcfcf]">({m.count})</span>
                    </span>
                    <strong>{formatARS(m.cents)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {payments.length === 0 ? (
            <p className="text-[15px] text-muted">No hay pagos registrados este día.</p>
          ) : (
            <ul className="flex flex-col">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 border-t border-line py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={p.status === "void" ? "text-muted line-through" : ""}>
                      <span className="tabular-nums">{p.time}</span> ·{" "}
                      <Link href={`/admin/alumnos/${p.studentId}`} className="font-semibold">
                        {p.studentName}
                      </Link>{" "}
                      · {methodLabel(p.method)}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <strong className={p.status === "void" ? "text-muted line-through" : ""}>{formatARS(p.amountCents)}</strong>
                  </div>
                  <span className="text-sm text-muted">
                    {p.concepts.join(" · ")}
                    {p.registeredBy ? ` · Cargó: ${p.registeredBy}` : ""}
                  </span>
                  {p.status === "void" && <span className="text-sm font-semibold text-alert-ink">ANULADO · {p.voidReason}</span>}
                  {p.status === "approved" && canVoid && (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-alert-ink">Anular</summary>
                      <form action={voidPayment} className="flex gap-2 pt-2">
                        <input type="hidden" name="payment_id" value={p.id} />
                        <input type="hidden" name="back" value="caja" />
                        <label htmlFor={`anular-${p.id}`} className="sr-only">
                          Motivo
                        </label>
                        <input
                          id={`anular-${p.id}`}
                          name="reason"
                          required
                          maxLength={200}
                          placeholder="Motivo (obligatorio)"
                          className="h-10 min-w-0 flex-1 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink"
                        />
                        <SmallSubmit tone="danger">Anular</SmallSubmit>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          {refunds.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl bg-alert-soft p-4">
              <span className="font-semibold text-alert-ink">Devoluciones del día</span>
              <ul className="flex flex-col gap-1 text-[15px]">
                {refunds.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span>
                      {r.time} · {r.studentName} · {methodLabel(r.method)}
                    </span>
                    <strong>−{formatARS(r.amountCents)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Cuotas vencidas</h2>
          {debtors.length === 0 && <p className="text-[15px] text-muted">Nadie debe cuotas vencidas.</p>}
          {[
            { title: "En período de gracia", rows: grace, style: "bg-warn-soft text-warn-ink", icon: "◷" },
            { title: "Acceso suspendido", rows: suspended, style: "bg-alert-soft text-alert-ink", icon: "✕" },
          ]
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <div key={g.title} className="flex flex-col gap-2">
                <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-bold ${g.style}`}>
                  <span aria-hidden="true">{g.icon} </span>
                  {g.title.toUpperCase()} ({g.rows.length})
                </span>
                <ul className="flex flex-col">
                  {g.rows.map((d) => (
                    <li key={`${d.studentId}-${d.dueDate}`} className="border-t border-line py-2.5">
                      <Link href={`/admin/alumnos/${d.studentId}#planes`} className="flex justify-between gap-3 text-ink no-underline hover:text-ink">
                        <span className="flex flex-col">
                          <span className="font-semibold">{d.studentName}</span>
                          <span className="text-sm text-muted">
                            Venció el {d.dueDate.split("-").reverse().join("/")}
                            {d.light.light === "grace" ? ` · ${d.light.daysLeft} ${d.light.daysLeft === 1 ? "día" : "días"} de gracia` : ""}
                          </span>
                        </span>
                        <strong className="shrink-0">{formatARS(d.pendingCents)}</strong>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>
      </div>
    </>
  );
}
