import type { Metadata } from "next";
import { SessionCard } from "@/components/classes/SessionCard";
import { WeeklyGrid } from "@/components/classes/WeeklyGrid";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { longDate } from "@/domain/classes/sessions";
import { addDays } from "@/domain/shared/calendar-date";
import { academyToday, loadGroups, slotsOf } from "@/lib/grilla";
import { ensureSessions, loadSessions, type SessionRow } from "@/lib/sessions";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis clases" };

/** Qué le pasa al profe en esta clase: la da, la reemplaza, o lo reemplazan. */
function myRole(s: SessionRow, profileId: string): { mine: boolean; note?: string } {
  if (s.substituteProfileId === profileId) return { mine: true, note: `Reemplazás a ${s.teacherName ?? "otro profe"}` };
  if (s.teacherProfileId === profileId) {
    return s.substituteProfileId ? { mine: true, note: `Te reemplaza ${s.substituteName}` } : { mine: true };
  }
  return { mine: false };
}

export default async function ProfeClasesPage() {
  const profile = await requireProfile();
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;

  const supabase = await createClient();
  await ensureSessions(supabase);
  const today = academyToday();
  const [sessions, groups] = await Promise.all([loadSessions(supabase, today, addDays(today, 13)), loadGroups(supabase, { onlyActive: true })]);

  const mine = sessions
    .map((s) => ({ s, role: myRole(s, profile.id) }))
    .filter((x) => x.role.mine);
  const days = [...new Set(mine.map((x) => x.s.date))];
  const weekly = slotsOf(groups.filter((g) => g.teacherProfileId === profile.id));

  return (
    <>
      <PageHeader title="Mis clases" subtitle="Tus clases de los próximos 14 días." />
      {mine.length === 0 ? (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface p-5">
          <span className="font-display text-xl font-bold uppercase tracking-wide">Sin clases próximas</span>
          <p className="text-[15px] leading-snug text-muted">
            Cuando administración te asigne grupos o reemplazos, vas a verlos acá.
          </p>
        </section>
      ) : (
        days.map((date) => (
          <section key={date} className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-bold uppercase tracking-wide">{date === today ? `Hoy · ${longDate(date)}` : longDate(date)}</h2>
            <ul className="flex flex-col gap-2">
              {mine
                .filter((x) => x.s.date === date)
                .map(({ s, role }) => (
                  <li key={s.id}>
                    <SessionCard session={s} extra={`Cupo ${s.capacity}`}>
                      {role.note && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm font-semibold text-warn-ink">{role.note}</p>}
                    </SessionCard>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
      {weekly.length > 0 && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-semibold">Mi grilla semanal</summary>
          <div className="pt-4">
            <WeeklyGrid slots={weekly} showCapacity />
          </div>
        </details>
      )}
    </>
  );
}
