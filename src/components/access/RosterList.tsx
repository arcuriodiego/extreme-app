import { SmallSubmit } from "@/components/forms/fields";
import type { RosterRow } from "@/lib/attendance";
import { toggleAttendance } from "@/lib/attendance-actions";

const KIND_LABELS = { fija: "FIJA", reserva: "RESERVA", otro: "PRESENTE" } as const;

/** Lista de la clase con presentes. `canMark`: puede marcar a mano (la base vuelve a controlarlo). */
export function RosterList({ rows, sessionId, back, canMark }: { rows: RosterRow[]; sessionId: string; back: string; canMark: boolean }) {
  if (rows.length === 0) return <p className="text-[15px] text-muted">Esta clase no tiene alumnos fijos ni reservas.</p>;
  const present = rows.filter((r) => r.present).length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[15px] font-semibold">
        {present} presente{present === 1 ? "" : "s"} de {rows.length}
      </p>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.studentId} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                {r.present && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-ok" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                )}
                <span className="font-semibold">{r.name}</span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold">{KIND_LABELS[r.kind]}</span>
              </span>
              <span className={`text-sm ${r.enabled ? "text-muted" : "font-semibold text-alert-ink"}`}>
                {r.present ? "Presente" : r.enabled ? "Todavía no llegó" : "No habilitado: que pase por recepción"}
              </span>
            </span>
            {canMark && (r.enabled || r.present) && (
              <form action={toggleAttendance}>
                <input type="hidden" name="session_id" value={sessionId} />
                <input type="hidden" name="student_id" value={r.studentId} />
                <input type="hidden" name="present" value={r.present ? "0" : "1"} />
                <input type="hidden" name="back" value={back} />
                <SmallSubmit tone={r.present ? "default" : "dark"}>{r.present ? "Quitar presente" : "Marcar presente"}</SmallSubmit>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
