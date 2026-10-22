import type { Metadata } from "next";
import { DayStrip } from "@/components/classes/DayStrip";
import { SessionCard } from "@/components/classes/SessionCard";
import { WeeklyGrid } from "@/components/classes/WeeklyGrid";
import { FormAlert } from "@/components/forms/fields";
import { PageHeader } from "@/components/ui/basics";
import { dayStrip, longDate, pickDay } from "@/domain/classes/sessions";
import { academyToday, loadGroups, slotsOf } from "@/lib/grilla";
import { ensureSessions, loadSessions } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clases" };

export default async function ClasesPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const params = await searchParams;
  const strip = dayStrip(academyToday());
  const day = pickDay(params.dia, strip);

  const supabase = await createClient();
  let failed = false;
  let sessions: Awaited<ReturnType<typeof loadSessions>> = [];
  let slots: ReturnType<typeof slotsOf> = [];
  try {
    await ensureSessions(supabase);
    [sessions, slots] = await Promise.all([
      loadSessions(supabase, day, day),
      loadGroups(supabase, { onlyActive: true }).then((g) => slotsOf(g)),
    ]);
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader title="Clases" />
      {failed && <FormAlert kind="error">No pudimos cargar las clases. Recargá la página.</FormAlert>}

      {!failed && slots.length === 0 ? (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface p-5">
          <span className="font-display text-xl font-bold uppercase tracking-wide">Grilla en preparación</span>
          <p className="text-[15px] leading-snug text-muted">Muy pronto vas a ver acá los días y horarios de cada clase.</p>
        </section>
      ) : (
        <>
          <DayStrip days={strip} selected={day} hrefFor={(d) => `/clases?dia=${d}`} />
          <section aria-labelledby="dia-elegido" className="flex flex-col gap-2">
            <h2 id="dia-elegido" className="font-display text-xl font-bold uppercase tracking-wide">
              {longDate(day)}
            </h2>
            {sessions.length === 0 ? (
              <p className="text-[15px] text-muted">No hay clases este día.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <SessionCard session={s} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="rounded-xl bg-surface px-4 py-3 text-[15px] leading-snug">
            Muy pronto vas a poder <strong>reservar</strong> desde acá. Por ahora, consultá en recepción.
          </p>
          {slots.length > 0 && (
            <details className="group rounded-xl border border-line p-4">
              <summary className="cursor-pointer font-semibold">Ver la grilla semanal completa</summary>
              <div className="pt-4">
                <WeeklyGrid slots={slots} />
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}
