/**
 * Liquidación de profes del mes: lo que cobra cada uno (un % sobre el precio en efectivo)
 * por cuotas pagadas, clases de pack, clases sueltas y créditos. Workshops no entran.
 */

export type PayrollConcept = "cuota" | "pack" | "suelta" | "credito";

export interface PayrollLine {
  teacherId: string;
  teacherName: string;
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
  byConcept: Record<PayrollConcept, { count: number; cents: number }>;
  totalCents: number;
  lines: PayrollLine[];
}

export const PAYROLL_LABELS: Record<PayrollConcept, string> = {
  cuota: "Cuota de profe",
  pack: "Clase de pack",
  suelta: "Clase suelta",
  credito: "Clase con crédito",
};

export function summarizePayroll(lines: readonly PayrollLine[]): PayrollSummary[] {
  const map = new Map<string, PayrollSummary>();
  for (const l of lines) {
    let s = map.get(l.teacherId);
    if (!s) {
      s = {
        teacherId: l.teacherId,
        name: l.teacherName,
        byConcept: { cuota: { count: 0, cents: 0 }, pack: { count: 0, cents: 0 }, suelta: { count: 0, cents: 0 }, credito: { count: 0, cents: 0 } },
        totalCents: 0,
        lines: [],
      };
      map.set(l.teacherId, s);
    }
    s.byConcept[l.concept].count++;
    s.byConcept[l.concept].cents += l.shareCents;
    s.totalCents += l.shareCents;
    s.lines.push(l);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** CSV de la liquidación (punto y coma, para Excel en español). Importes en pesos. */
export function payrollCsv(summaries: readonly PayrollSummary[], fmtDate: (iso: string) => string): string {
  const pesos = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out = ["Profe;Fecha;Concepto;Alumno;Detalle;Precio en efectivo;A pagar"];
  for (const s of summaries) {
    for (const l of [...s.lines].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      out.push([s.name, fmtDate(l.occurredAt), PAYROLL_LABELS[l.concept], l.studentName, l.detail, pesos(l.baseCents), pesos(l.shareCents)].map(esc).join(";"));
    }
    out.push([`Total ${s.name}`, "", "", "", "", "", pesos(s.totalCents)].map(esc).join(";"));
  }
  return "﻿" + out.join("\r\n") + "\r\n";
}
