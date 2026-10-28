import { TeacherAvatar } from "@/components/images/TeacherAvatar";
import Link from "next/link";
import { weeklyGrid } from "@/domain/classes/schedule";
import type { Slot } from "@/lib/grilla";

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });

function shortDate(date: string): string {
  return dateFormat.format(new Date(`${date}T12:00:00Z`)).replace(".", "");
}

/**
 * Grilla semanal: un bloque por día, las clases ordenadas por hora.
 * La usan el alumno (Clases), el profe (Mis clases) y gestión.
 */
export function WeeklyGrid({
  slots,
  showCapacity = false,
  hrefFor,
  wide = false,
}: {
  slots: readonly Slot[];
  showCapacity?: boolean;
  hrefFor?: (slot: Slot) => string;
  wide?: boolean;
}) {
  const days = weeklyGrid(slots);
  return (
    <div className={wide ? "grid gap-6 md:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-6"}>
      {days.map((day) => (
        <section key={day.weekday} aria-labelledby={`dia-${day.weekday}`} className="flex flex-col gap-2">
          <h2 id={`dia-${day.weekday}`} className="font-display text-xl font-bold uppercase tracking-wide text-brand">
            {day.label}
          </h2>
          <ul className="flex flex-col gap-2">
            {day.slots.map((slot) => {
              const body = (
                <>
                  <span className="w-[92px] shrink-0 font-display text-lg font-bold leading-tight tabular-nums">
                    {slot.start}
                    <span className="block text-sm font-semibold text-muted">a {slot.end}</span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold leading-snug">{slot.title}</span>
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      {slot.teacherPhotoUrl && <TeacherAvatar name={slot.teacherName ?? ""} url={slot.teacherPhotoUrl} size={24} />}
                      <span>
                        {slot.teacherName ? `Prof. ${slot.teacherName}` : "Profe a confirmar"} · {slot.roomName}
                        {showCapacity ? ` · Cupo ${slot.capacity}` : ""}
                      </span>
                    </span>
                    {(slot.startsOn || !slot.allowsSingleBooking) && (
                      <span className="flex flex-wrap gap-1.5 pt-1">
                        {slot.startsOn && (
                          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold">DESDE EL {shortDate(slot.startsOn).toUpperCase()}</span>
                        )}
                        {!slot.allowsSingleBooking && (
                          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold">SÓLO CUOTA DE PROFE</span>
                        )}
                      </span>
                    )}
                  </span>
                </>
              );
              const box = "flex gap-3 rounded-xl border border-line p-3.5";
              return (
                <li key={slot.id}>
                  {hrefFor ? (
                    <Link href={hrefFor(slot)} className={`${box} text-ink no-underline hover:border-ink hover:text-ink`}>
                      {body}
                    </Link>
                  ) : (
                    <div className={box}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
