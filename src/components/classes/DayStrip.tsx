import Link from "next/link";
import type { StripDay } from "@/domain/classes/sessions";

/** Selector de días: hoy y los días siguientes, como en el diseño aprobado. */
export function DayStrip({ days, selected, hrefFor }: { days: readonly StripDay[]; selected: string; hrefFor: (date: string) => string }) {
  return (
    <nav aria-label="Elegir día" className="-mx-5 overflow-x-auto px-5">
      <ul className="flex gap-2">
        {days.map((d) => {
          const on = d.date === selected;
          return (
            <li key={d.date} className="min-w-[52px] flex-1">
              <Link
                href={hrefFor(d.date)}
                aria-current={on ? "date" : undefined}
                aria-label={d.isToday ? `Hoy, ${d.dayNumber}` : `${d.short} ${d.dayNumber}`}
                className={`flex h-[58px] flex-col items-center justify-center rounded-xl border no-underline ${
                  on ? "border-ink bg-ink text-white hover:text-white" : "border-line bg-white text-ink hover:border-ink hover:text-ink"
                }`}
              >
                <span className="text-xs font-bold tracking-wide">{d.isToday ? "HOY" : d.short}</span>
                <span className="font-display text-xl font-bold leading-none">{d.dayNumber}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
