import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { academyConfig } from "@/config/academy";
import { canOpen } from "@/domain/navigation/menus";
import { ROLE_LABELS, parseMonth, shiftMonth, summarizeTeachers } from "@/domain/reports/teachers";
import { academyToday } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { academyDayOf, loadTeacherPayroll, loadTeacherReport, loadTeacherSharePct } from "@/lib/teacher-report";
import { PAYROLL_LABELS, PERIOD_LABELS, summarizePayroll } from "@/domain/reports/payroll";
import { formatARS } from "@/domain/shared/money";

export const metadata: Metadata = { title: "Reporte de profes" };

const monthName = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
const when = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: academyConfig.timeZone,
});
const ROLE_STYLE = {
  dictada: "bg-ok-soft text-ok-ink",
  "reemplazo-dado": "bg-ok-soft text-ok-ink",
  reemplazada: "bg-surface text-ink",
  suspendida: "bg-alert-soft text-alert-ink",
  "por-dar": "bg-surface text-muted",
} as const;

const hoursLabel = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")} h`;

export default async function ReporteProfesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "reportes")) return <NoAccess />;
  const month = parseMonth(params.mes, academyToday());
  const supabase = await createClient();
  const [rows, payrollLines, sharePct] = await Promise.all([
    loadTeacherReport(supabase, month),
    loadTeacherPayroll(supabase, month),
    loadTeacherSharePct(supabase),
  ]);
  const teachers = summarizeTeachers(rows, new Date());
  const payroll = summarizePayroll(payrollLines, academyDayOf);
  const payrollTotal = payroll.reduce((s, p) => s + p.totalCents, 0);
  const label = monthName.format(new Date(`${month}T12:00:00Z`));
  const mes = month.slice(0, 7);

  return (
    <>
      <PageHeader title="Reporte de profes" subtitle="Cuánto le corresponde a cada profe, y sus clases dictadas, reemplazos y presentes." />
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`?mes=${shiftMonth(month, -1)}`} className="text-sm font-semibold" aria-label="Mes anterior">
          ‹ Anterior
        </Link>
        <span className="font-display text-2xl font-bold uppercase tracking-wide">{label}</span>
        <Link href={`?mes=${shiftMonth(month, 1)}`} className="text-sm font-semibold" aria-label="Mes siguiente">
          Siguiente ›
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Liquidación</h2>
          {payroll.length > 0 && (
            <a href={`/admin/reportes/profes/csv?mes=${mes}&tipo=liquidacion`} className="inline-flex h-9 items-center rounded-full border border-[#cfcfcf] px-3.5 text-sm font-semibold no-underline">
              Descargar liquidación para Excel
            </a>
          )}
        </div>
        <p className="text-sm text-muted">
          Cada profe cobra el <strong>{sharePct} %</strong> del precio en efectivo: de cada cuota pagada en el mes (al profe de la cuota), y de cada clase
          de pack, suelta o con crédito que ya se dio (al profe que la dio). Pack: precio ÷ cantidad de clases. Workshops no entran. Quien cobra por
          quincena ve separado lo del 1 al 15 y lo del 16 a fin de mes. El porcentaje se cambia en Configuración → Reglas; la modalidad de cada profe,
          en Clases y grilla → Catálogo → Profes.
        </p>
        {payroll.length === 0 ? (
          <p className="text-[15px] text-muted">No hay nada para liquidar en este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Profe</th>
                  <th className="py-2 pr-3 text-right font-semibold">Cuotas</th>
                  <th className="py-2 pr-3 text-right font-semibold">Clases de pack</th>
                  <th className="py-2 pr-3 text-right font-semibold">Sueltas</th>
                  <th className="py-2 pr-3 text-right font-semibold">Con crédito</th>
                  <th className="py-2 text-right font-semibold">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {payroll.map((p) => (
                  <tr key={p.teacherId} className="border-b border-line">
                    <td className="py-2.5 pr-3 font-semibold">
                      {p.name}
                      <span className="block text-xs font-normal text-muted">{PERIOD_LABELS[p.payPeriod]}</span>
                    </td>
                    {(["cuota", "pack", "suelta", "credito"] as const).map((k) => (
                      <td key={k} className="py-2.5 pr-3 text-right tabular-nums">
                        {p.byConcept[k].count > 0 ? (
                          <>
                            {formatARS(p.byConcept[k].cents)}
                            <span className="block text-xs text-muted">
                              {p.byConcept[k].count} {k === "cuota" ? (p.byConcept[k].count === 1 ? "cuota" : "cuotas") : p.byConcept[k].count === 1 ? "clase" : "clases"}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2.5 text-right tabular-nums">
                      <span className="font-display text-xl font-bold">{formatARS(p.totalCents)}</span>
                      {p.payPeriod === "fortnight" && (
                        <span className="block text-xs text-muted">
                          1ª quincena {formatARS(p.halves.first)} · 2ª quincena {formatARS(p.halves.second)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 pr-3 font-semibold" colSpan={5}>
                    Total del mes
                  </td>
                  <td className="py-2.5 text-right font-display text-xl font-bold tabular-nums">{formatARS(payrollTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {payroll.map((p) => (
          <details key={p.teacherId} className="rounded-xl border border-line p-3">
            <summary className="cursor-pointer font-semibold">
              {p.name} · {formatARS(p.totalCents)}
            </summary>
            <ul className="flex flex-col pt-2">
              {p.lines.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-[15px]">
                  <span>
                    <span className="capitalize">{when.format(new Date(l.occurredAt))}</span> · {PAYROLL_LABELS[l.concept]} · {l.studentName}
                    <span className="text-sm text-muted"> · {l.detail} · base {formatARS(l.baseCents)}</span>
                  </span>
                  <strong className="tabular-nums">{formatARS(l.shareCents)}</strong>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-6">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Clases y asistencia</h2>
        {teachers.length > 0 && (
          <a href={`/admin/reportes/profes/csv?mes=${mes}`} className="inline-flex h-9 items-center rounded-full border border-[#cfcfcf] px-3.5 text-sm font-semibold no-underline">
            Descargar clases para Excel
          </a>
        )}
      </div>

      {teachers.length === 0 ? (
        <p className="text-[15px] text-muted">No hay clases en este mes.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Profe</th>
                  <th className="py-2 pr-3 text-right font-semibold">Dictadas</th>
                  <th className="py-2 pr-3 text-right font-semibold">Horas</th>
                  <th className="py-2 pr-3 text-right font-semibold">Como reemplazo</th>
                  <th className="py-2 pr-3 text-right font-semibold">Las dio otro</th>
                  <th className="py-2 pr-3 text-right font-semibold">Suspendidas</th>
                  <th className="py-2 pr-3 text-right font-semibold">Presentes</th>
                  <th className="py-2 text-right font-semibold">Por dar</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.teacherId} className="border-b border-line">
                    <td className="py-2.5 pr-3 font-semibold">{t.name}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-bold">{t.taught}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{hoursLabel(t.hours)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{t.asSubstitute}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{t.replaced}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{t.cancelled}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {t.present}
                      {t.taught > 0 ? <span className="text-sm text-muted"> · {(t.present / t.taught).toFixed(1).replace(".", ",")} por clase</span> : null}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted">{t.upcoming}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted">
            &quot;Dictadas&quot; son las clases que ya terminaron, propias o como reemplazo. Las suspendidas por la academia (feriados, cierres) no cuentan.
          </p>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-bold uppercase tracking-wide">Detalle de clases</h2>
            {teachers.map((t) => (
              <details key={t.teacherId} className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer font-semibold">
                  {t.name} · {t.taught} {t.taught === 1 ? "clase dictada" : "clases dictadas"}
                </summary>
                <ul className="flex flex-col pt-2">
                  {[...t.lines]
                    .sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt))
                    .map((l) => (
                      <li key={`${l.session.sessionId}-${l.role}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-[15px]">
                        <span>
                          <span className="capitalize">{when.format(new Date(l.session.startsAt))}</span> · {l.session.groupName}
                          {l.role === "reemplazada" && l.session.taughtByName ? ` · la dio ${l.session.taughtByName}` : ""}
                          {l.role === "reemplazo-dado" && l.session.ownerName ? ` · reemplazando a ${l.session.ownerName}` : ""}
                          {l.role === "suspendida" && l.session.cancelReason ? ` · ${l.session.cancelReason}` : ""}
                        </span>
                        <span className="flex items-center gap-2">
                          {(l.role === "dictada" || l.role === "reemplazo-dado") && <span className="text-sm text-muted">{l.session.present} presentes</span>}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ROLE_STYLE[l.role]}`}>{ROLE_LABELS[l.role].toUpperCase()}</span>
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            ))}
          </section>
        </>
      )}
    </>
  );
}
