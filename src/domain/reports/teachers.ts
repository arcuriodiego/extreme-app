/**
 * Reporte por profe del mes: clases dictadas (las que ya terminaron y no se
 * suspendieron), reemplazos y presentes. Para liquidar sueldos.
 */

export interface ReportSession {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "cancelled" | "completed";
  cancelReason: string | null;
  groupName: string;
  ownerId: string | null;
  ownerName: string | null;
  taughtById: string | null;
  taughtByName: string | null;
  present: number;
}

export type SessionRole = "dictada" | "reemplazo-dado" | "reemplazada" | "suspendida" | "por-dar";

export interface TeacherLine {
  session: ReportSession;
  role: SessionRole;
}

export interface TeacherSummary {
  teacherId: string;
  name: string;
  /** Clases que dio (propias + reemplazos), ya terminadas. */
  taught: number;
  /** De esas, cuántas fueron reemplazando a otro profe. */
  asSubstitute: number;
  /** Clases propias que dio otro profe. */
  replaced: number;
  /** Clases propias suspendidas por la academia. */
  cancelled: number;
  /** Clases que todavía no pasaron este mes. */
  upcoming: number;
  /** Horas dictadas. */
  hours: number;
  present: number;
  lines: TeacherLine[];
}

export function summarizeTeachers(rows: readonly ReportSession[], now: Date): TeacherSummary[] {
  const map = new Map<string, TeacherSummary>();
  const get = (id: string, name: string | null) => {
    let s = map.get(id);
    if (!s) {
      s = { teacherId: id, name: name ?? "Sin nombre", taught: 0, asSubstitute: 0, replaced: 0, cancelled: 0, upcoming: 0, hours: 0, present: 0, lines: [] };
      map.set(id, s);
    }
    return s;
  };

  for (const r of rows) {
    const done = new Date(r.endsAt).getTime() <= now.getTime();
    const cancelled = r.status === "cancelled";
    const substituted = !!r.taughtById && !!r.ownerId && r.taughtById !== r.ownerId;

    if (cancelled) {
      if (r.ownerId) {
        const o = get(r.ownerId, r.ownerName);
        o.cancelled++;
        o.lines.push({ session: r, role: "suspendida" });
      }
      continue;
    }
    if (substituted && r.ownerId) {
      const o = get(r.ownerId, r.ownerName);
      o.replaced++;
      o.lines.push({ session: r, role: "reemplazada" });
    }
    if (!r.taughtById) continue;
    const t = get(r.taughtById, r.taughtByName);
    if (!done) {
      t.upcoming++;
      t.lines.push({ session: r, role: "por-dar" });
      continue;
    }
    t.taught++;
    if (substituted) t.asSubstitute++;
    t.hours += (new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime()) / 3_600_000;
    t.present += r.present;
    t.lines.push({ session: r, role: substituted ? "reemplazo-dado" : "dictada" });
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export const ROLE_LABELS: Record<SessionRole, string> = {
  dictada: "Dictada",
  "reemplazo-dado": "Reemplazo",
  reemplazada: "La dio otro profe",
  suspendida: "Suspendida",
  "por-dar": "Por dar",
};

/** "2026-11" → primer día del mes; si no es válido, el mes de `today`. */
export function parseMonth(value: string | undefined, today: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}-01`;
  return `${today.slice(0, 7)}-01`;
}

export function shiftMonth(first: string, delta: number): string {
  const [y, m] = first.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** CSV (separado por punto y coma, como lo abre Excel en español). */
export function teachersCsv(summaries: readonly TeacherSummary[], fmtDate: (iso: string) => string): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Profe", "Fecha", "Clase", "Situación", "Dada por", "Presentes"];
  const out = [head.join(";")];
  for (const t of summaries) {
    for (const l of [...t.lines].sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt))) {
      out.push(
        [t.name, fmtDate(l.session.startsAt), l.session.groupName, ROLE_LABELS[l.role], l.session.taughtByName ?? "", l.role === "suspendida" ? "" : l.session.present]
          .map(esc)
          .join(";"),
      );
    }
  }
  return "﻿" + out.join("\r\n") + "\r\n";
}
