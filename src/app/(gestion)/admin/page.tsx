import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { academyConfig } from "@/config/academy";
import { methodLabel } from "@/domain/billing/payments";
import { longDate } from "@/domain/classes/sessions";
import { MEMBERSHIP_ALERT_LABELS, type MembershipAlert, monthRows, occupancy, percentChange } from "@/domain/dashboard/summary";
import { canOpen } from "@/domain/navigation/menus";
import { timeInZone } from "@/domain/shared/calendar-date";
import { formatARS } from "@/domain/shared/money";
import { ensureCharges } from "@/lib/billing";
import { loadDashboard } from "@/lib/dashboard";
import { ensureSessions } from "@/lib/sessions";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Panel" };

const TZ = academyConfig.timeZone;
const time = (iso: string) => timeInZone(new Date(iso), TZ);
const shortDate = (d: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)).replace(".", "");

const ALERT_TONES: Record<MembershipAlert, string> = {
  long_suspended: "bg-alert text-white",
  suspended: "bg-alert-soft text-alert-ink",
  grace: "bg-warn-soft text-warn-ink",
  unpaid_first: "bg-surface text-ink",
};

function Tile({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const body = (
    <>
      <span className="text-sm font-semibold text-muted">{label}</span>
      <strong className="font-display text-[34px] leading-none">{value}</strong>
      {note && <span className="text-sm text-muted">{note}</span>}
    </>
  );
  const cls = "flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-line p-4 text-ink no-underline";
  return href ? (
    <Link href={href} className={`${cls} hover:border-ink hover:text-ink`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-2xl font-bold uppercase tracking-wide">{children}</h2>;
}

export default async function PanelPage() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "panel")) return <NoAccess />;

  const supabase = await createClient();
  await Promise.all([ensureSessions(supabase), ensureCharges(supabase)]);
  const d = await loadDashboard(supabase);

  const m = d.memberships;
  const month = d.month ? monthRows(d.month.by_concept, d.month.refunds) : null;
  const change = d.month && month ? percentChange(month.net, d.month.previous) : null;
  const pending = m.grace + m.suspended + m.unpaid_first;

  return (
    <>
      <PageHeader eyebrow={`Hoy · ${longDate(d.today)}`} title="Panel" subtitle="El día y el mes de la academia, de un vistazo." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.cash_today !== undefined && <Tile label="Caja de hoy" value={formatARS(d.cash_today)} note="Cobros menos devoluciones" href="/admin/pagos" />}
        {d.month && month && (
          <Tile
            label="Ingresos del mes"
            value={formatARS(month.net)}
            note={change === null ? "Sin datos del mes anterior" : `${change >= 0 ? "+" : ""}${change}% vs. el mismo tramo del mes pasado`}
          />
        )}
        <Tile
          label="Ingresos a clase hoy"
          value={String(d.entries.allowed)}
          note={d.entries.denied > 0 ? `${d.entries.denied} sin habilitar` : "Ninguno rechazado"}
          href="/admin/escaner"
        />
        <Tile label="Alumnos activos" value={String(d.active_students)} note="Con cuota o pack vigente" href="/admin/alumnos" />
      </div>

      <div className="grid gap-10 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3">
          <SectionTitle>Clases de hoy</SectionTitle>
          {d.classes.length === 0 ? (
            <p className="text-[15px] text-muted">Hoy no hay clases.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {d.classes.map((c) => {
                const cancelled = c.status === "cancelled";
                const pct = occupancy(c.fixed, c.booked, c.capacity);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/admin/clases/calendario/lista/${c.id}`}
                      className={`flex gap-3 rounded-xl border border-line p-3.5 text-ink no-underline hover:border-ink hover:text-ink ${cancelled ? "bg-surface" : ""}`}
                    >
                      <span className={`w-14 shrink-0 font-display text-lg font-bold tabular-nums ${cancelled ? "text-muted line-through" : ""}`}>
                        {time(c.starts_at)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="font-semibold">{c.label}</span>
                        <span className="text-sm text-muted">
                          {c.teacher ? `${c.substitute ? "Reemplazo: " : "Prof. "}${c.teacher}` : "Sin profe"} · {c.room}
                        </span>
                        {cancelled ? (
                          <span className="text-sm font-semibold text-alert-ink">Suspendida</span>
                        ) : (
                          <>
                            <span className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                              <span className={`block h-full rounded-full ${pct >= 100 ? "bg-alert" : "bg-ink"}`} style={{ width: `${pct}%` }} />
                            </span>
                            <span className="text-sm">
                              {c.fixed} fijos + {c.booked} reservas de {c.capacity}
                              {pct >= 100 ? " · completa" : ""} · <strong>{c.present} presentes</strong>
                            </span>
                          </>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <SectionTitle>Para atender</SectionTitle>
          {pending === 0 ? (
            <p className="rounded-xl bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-ink">Todas las cuotas están al día.</p>
          ) : (
            <>
              <p className="text-[15px]">
                {[
                  m.long_suspended > 0 && `${m.long_suspended} para decidir la baja`,
                  m.suspended - m.long_suspended > 0 && `${m.suspended - m.long_suspended} suspendidas`,
                  m.grace > 0 && `${m.grace} en gracia`,
                  m.unpaid_first > 0 && `${m.unpaid_first} sin primer pago`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {m.owed_cents ? ` · Deuda total ${formatARS(m.owed_cents)}` : ""}
              </p>
              <ul className="flex flex-col">
                {m.list.map((a, i) => (
                  <li key={`${a.student_id}-${i}`} className="border-t border-line">
                    <Link
                      href={`/admin/alumnos/${a.student_id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-ink no-underline hover:text-ink"
                    >
                      <span className="flex flex-col">
                        <span className="font-semibold">{a.name}</span>
                        <span className="text-sm text-muted">
                          {a.state === "unpaid_first"
                            ? "Cuota sin el primer cobro"
                            : a.state === "grace"
                              ? `La cuota venció el ${shortDate(a.since ?? d.today)}`
                              : `Cuota suspendida desde el ${shortDate(a.since ?? d.today)}`}
                          {a.owed_cents ? ` · debe ${formatARS(a.owed_cents)}` : ""}
                        </span>
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${ALERT_TONES[a.state]}`}>
                        {MEMBERSHIP_ALERT_LABELS[a.state]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {pending > m.list.length && (
                <Link href="/admin/pagos" className="text-sm font-semibold">
                  Ver todas en Pagos →
                </Link>
              )}
            </>
          )}

          <h3 className="pt-3 font-display text-xl font-bold uppercase tracking-wide">Vence pronto</h3>
          {d.due_soon.length === 0 ? (
            <p className="text-[15px] text-muted">Nada vence en los próximos días.</p>
          ) : (
            <ul className="flex flex-col">
              {d.due_soon.map((v, i) => (
                <li key={`${v.kind}-${v.student_id}-${i}`} className="border-t border-line">
                  <Link
                    href={`/admin/alumnos/${v.student_id}`}
                    className="flex items-center justify-between gap-2 py-2.5 text-[15px] text-ink no-underline hover:text-ink"
                  >
                    <span>
                      <strong>{v.name}</strong> ·{" "}
                      {v.kind === "cuota"
                        ? `cuota${v.amount_cents ? ` de ${formatARS(v.amount_cents)}` : ""}`
                        : `pack con ${v.remaining} ${v.remaining === 1 ? "clase" : "clases"} sin usar`}
                    </span>
                    <span className="shrink-0 text-sm font-semibold">{v.date === d.today ? "Hoy" : shortDate(v.date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {d.month && month && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Ingresos del mes</SectionTitle>
          <div className="grid max-w-4xl gap-8 md:grid-cols-2">
            <div className="flex flex-col">
              <span className="pb-1 text-sm font-semibold text-muted">Por concepto</span>
              {month.rows.length === 0 ? (
                <p className="text-[15px] text-muted">Todavía no hay cobros este mes.</p>
              ) : (
                month.rows.map((r) => (
                  <div key={r.key} className="flex justify-between gap-3 border-t border-line py-2 text-[15px]">
                    <span>{r.label}</span>
                    <strong className="tabular-nums">{formatARS(r.cents)}</strong>
                  </div>
                ))
              )}
              {d.month.refunds > 0 && (
                <div className="flex justify-between gap-3 border-t border-line py-2 text-[15px]">
                  <span>Devoluciones</span>
                  <strong className="tabular-nums text-alert-ink">−{formatARS(d.month.refunds)}</strong>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t-2 border-ink py-2 text-[15px]">
                <span className="font-semibold">Total</span>
                <strong className="tabular-nums">{formatARS(month.net)}</strong>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="pb-1 text-sm font-semibold text-muted">Por medio de pago</span>
              {Object.entries(d.month.by_method)
                .sort((a, b) => b[1] - a[1])
                .map(([method, cents]) => (
                  <div key={method} className="flex justify-between gap-3 border-t border-line py-2 text-[15px]">
                    <span>{methodLabel(method)}</span>
                    <strong className="tabular-nums">{formatARS(cents)}</strong>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
