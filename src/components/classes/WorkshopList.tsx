import { SmallSubmit } from "@/components/forms/fields";
import { academyConfig } from "@/config/academy";
import { longDate } from "@/domain/classes/sessions";
import { formatARS } from "@/domain/shared/money";
import { seatsLabel } from "@/domain/workshops/workshops";
import type { WaitlistRow, WorkshopRow } from "@/lib/workshops";
import { joinWorkshopWaitlist, leaveWorkshopWaitlist } from "@/app/(app)/clases/actions";

const until = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: academyConfig.timeZone,
});

/** Workshops publicados y próximos, para el alumno (con su lista de espera). */
export function WorkshopList({
  workshops,
  mine,
  waits = new Map(),
  canJoin = false,
  back = "/clases",
}: {
  workshops: readonly WorkshopRow[];
  mine: ReadonlySet<string>;
  waits?: ReadonlyMap<string, WaitlistRow>;
  canJoin?: boolean;
  back?: string;
}) {
  if (workshops.length === 0) return null;
  return (
    <section aria-labelledby="workshops" className="flex flex-col gap-2">
      <h2 id="workshops" className="font-display text-xl font-bold uppercase tracking-wide">
        Workshops
      </h2>
      <ul className="flex flex-col gap-2">
        {workshops.map((w) => {
          const wait = waits.get(w.id);
          const full = w.taken + w.held >= w.capacity;
          return (
            <li key={w.id} className="flex flex-col gap-2 rounded-xl border border-line p-4">
              {w.imageUrl && (
                <a href={w.imageUrl} target="_blank" rel="noopener" className="-mx-1 -mt-1 block" aria-label={`Ver el flyer de ${w.title} completo`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.imageUrl} alt={`Flyer de ${w.title}`} loading="lazy" className="max-h-[32rem] w-full rounded-lg bg-surface object-contain" />
                </a>
              )}
              <div className="flex items-start justify-between gap-3">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{w.title}</span>
                  {w.teacherName && <span className="text-sm text-muted">{w.teacherName}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <strong className="font-display text-xl">{formatARS(w.nonCashPriceCents)}</strong>
                  {w.nonCashPriceCents > w.priceCents && <span className="text-xs text-muted">{formatARS(w.priceCents)} en efectivo</span>}
                </span>
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
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold">{seatsLabel(w.capacity, w.taken + w.held).toUpperCase()}</span>
                )}
              </span>

              {!mine.has(w.id) && wait?.status === "offered" && (
                <div className="flex flex-col gap-2 rounded-xl bg-ok-soft p-3">
                  <span className="text-[15px] font-semibold text-ok-ink">
                    ¡Se liberó un lugar! Te lo guardamos hasta el {wait.offerExpiresAt ? until.format(new Date(wait.offerExpiresAt)) : ""}. Pagá{" "}
                    {formatARS(w.nonCashPriceCents)}
                    {w.nonCashPriceCents > w.priceCents ? ` (o ${formatARS(w.priceCents)} en efectivo)` : ""} en recepción antes de esa hora para quedarte con él.
                  </span>
                  {canJoin && (
                    <form action={leaveWorkshopWaitlist}>
                      <input type="hidden" name="entry_id" value={wait.id} />
                      <input type="hidden" name="back" value={back} />
                      <SmallSubmit>No puedo ir: liberar el lugar</SmallSubmit>
                    </form>
                  )}
                </div>
              )}
              {!mine.has(w.id) && wait?.status === "waiting" && (
                <form action={leaveWorkshopWaitlist} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                  <input type="hidden" name="entry_id" value={wait.id} />
                  <input type="hidden" name="back" value={back} />
                  <span className="text-sm font-semibold">En lista de espera · puesto {wait.position}</span>
                  {canJoin && <SmallSubmit>Salir de la lista</SmallSubmit>}
                </form>
              )}
              {!mine.has(w.id) && !wait && full && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                  <span className="text-sm text-muted">Si se libera un lugar, te avisamos y te lo guardamos 24 h.</span>
                  {canJoin && (
                    <form action={joinWorkshopWaitlist}>
                      <input type="hidden" name="workshop_id" value={w.id} />
                      <input type="hidden" name="back" value={back} />
                      <SmallSubmit>Anotarme en la lista de espera</SmallSubmit>
                    </form>
                  )}
                </div>
              )}
              {!mine.has(w.id) && !wait && !full && (
                <p className="text-sm text-muted">
                  Se reserva en recepción, con el pago total. Si cancelás con 48 h o más de anticipación, se te devuelve el dinero.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
