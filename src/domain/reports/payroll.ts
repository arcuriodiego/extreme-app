/**
 * Liquidación de profes del mes: lo que cobra cada uno (un % sobre el precio en efectivo)
 * por cuotas pagadas, clases de pack, clases sueltas y créditos. Workshops no entran.
 */

export type PayrollConcept = "cuota" | "pack" | "suelta" | "credito";

export type PayPeriod = "month" | "fortnight";

export interface PayrollLine {
  teacherId: string;
  teacherName: string;
  payPeriod: PayPeriod;
  concept: PayrollConcept;
  occurredAt: string;
  studentName: string;
  detail: string;
  baseCents: number;
  shareCents: number;
}

export interface PayrollSummary {
  teacherId: string;
  name: string;
  payPeriod: PayPeriod;
  /** Lo de la 1ª quincena (días 1 a 15) y la 2ª (16 a fin de mes), para quien cobra por quincena. */
  halves: { first: number; second: number };
  byConcept: Record<PayrollConcept, { count: number; cents: number }>;
  totalCents: number;
  lines: PayrollLine[];
}

export const PERIOD_LABELS: Record<PayPeriod, string> = { month: "Mes completo", fortnight: "Por quincena" };

export const PAYROLL_LABELS: Record<PayrollConcept, string> = {
  cuota: "Cuota de profe",
  pack: "Clase de pack",
  suelta: "Clase suelta",
  credito: "Clase con crédito",
};

/** Quincena de una fecha: 1 (días 1 a 15) o 2 (16 en adelante). `dayOf` da el día del mes en la hora de la academia. */
export function fortnightOf(iso: string, dayOf: (iso: string) => number): 1 | 2 {
  return dayOf(iso) <= 15 ? 1 : 2;
}

const utcDay = (iso: string) => new Date(iso).getUTCDate();

export function summarizePayroll(lines: readonly PayrollLine[], dayOf: (iso: string) => number = utcDay): PayrollSummary[] {
  const map = new Map<string, PayrollSummary>();
  for (const l of lines) {
    let s = map.get(l.teacherId);
    if (!s) {
      s = {
        teacherId: l.teacherId,
        name: l.teacherName,
        payPeriod: l.payPeriod,
        halves: { first: 0, second: 0 },
        byConcept: { cuota: { count: 0, cents: 0 }, pack: { count: 0, cents: 0 }, suelta: { count: 0, cents: 0 }, credito: { count: 0, cents: 0 } },
        totalCents: 0,
        lines: [],
      };
      map.set(l.teacherId, s);
    }
    s.byConcept[l.concept].count++;
    s.byConcept[l.concept].cents += l.shareCents;
    s.totalCents += l.shareCents;
    if (fortnightOf(l.occurredAt, dayOf) === 1) s.halves.first += l.shareCents;
    else s.halves.second += l.shareCents;
    s.lines.push(l);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** CSV de la liquidación (punto y coma, para Excel en español). Importes en pesos. */
export function payrollCsv(summaries: readonly PayrollSummary[], fmtDate: (iso: string) => string, dayOf: (iso: string) => number = utcDay): string {
  const pesos = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out = ["Profe;Cobra;Fecha;Quincena;Concepto;Alumno;Detalle;Precio en efectivo;A pagar"];
  for (const s of summaries) {
    for (const l of [...s.lines].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      const half = fortnightOf(l.occurredAt, dayOf) === 1 ? "1ª" : "2ª";
      out.push(
        [s.name, PERIOD_LABELS[s.payPeriod], fmtDate(l.occurredAt), half, PAYROLL_LABELS[l.concept], l.studentName, l.detail, pesos(l.baseCents), pesos(l.shareCents)]
          .map(esc)
          .join(";"),
      );
    }
    if (s.payPeriod === "fortnight") {
      out.push([`${s.name} · 1ª quincena`, "", "", "", "", "", "", "", pesos(s.halves.first)].map(esc).join(";"));
      out.push([`${s.name} · 2ª quincena`, "", "", "", "", "", "", "", pesos(s.halves.second)].map(esc).join(";"));
    }
    out.push([`Total ${s.name}`, "", "", "", "", "", "", "", pesos(s.totalCents)].map(esc).join(";"));
  }
  return "﻿" + out.join("\r\n") + "\r\n";
}
