import { longDate } from "@/domain/classes/sessions";
import { formatARS } from "@/domain/shared/money";
import { seatsLabel } from "@/domain/workshops/workshops";
import type { WorkshopRow } from "@/lib/workshops";

/** Workshops publicados y próximos, para el alumno. */
export function WorkshopList({ workshops, mine }: { workshops: readonly WorkshopRow[]; mine: ReadonlySet<string> }) {
  if (workshops.length === 0) return null;
  return (
    <section aria-labelledby="workshops" className="flex flex-col gap-2">
      <h2 id="workshops" className="font-display text-xl font-bold uppercase tracking-wide">
        Workshops
      </h2>
      <ul className="flex flex-col gap-2">
        {workshops.map((w) => (
          <li key={w.id} className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{w.title}</span>
                {w.teacherName && <span className="text-sm text-muted">{w.teacherName}</span>}
              </span>
              <strong className="shrink-0 font-display text-xl">{formatARS(w.priceCents)}</strong>
            </div>
            <ul className="flex flex-col gap-0.5 text-sm">
              {w.sessions.map((s) => (
                <li key={s.id}>
                  {longDate(s.date)} · {s.start} a {s.end} · {s.roomName}
                </li>
              ))}
            </ul>
            {w.description && <p className="text-sm text-muted">{w.description}</p>}
            <span className="flex flex-wrap gap-1.5">
              {mine.has(w.id) ? (
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">ESTÁS INSCRIPTO</span>
              ) : (
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold">{seatsLabel(w.capacity, w.taken).toUpperCase()}</span>
              )}
            </span>
            {!mine.has(w.id) && w.taken < w.capacity && (
              <p className="text-sm text-muted">Se reserva en recepción, con el pago total. Si cancelás con 48 h o más de anticipación, se te devuelve el dinero.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
