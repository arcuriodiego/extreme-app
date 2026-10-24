import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { longDate } from "@/domain/classes/sessions";
import { addDays } from "@/domain/shared/calendar-date";
import { academyToday } from "@/lib/grilla";
import { ensureSessions, loadSessions } from "@/lib/sessions";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Asistencia" };

export default async function AsistenciaPage() {
  const profile = await requireProfile();
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;

  const supabase = await createClient();
  const today = academyToday();
  const [, sessions] = await Promise.all([ensureSessions(supabase), loadSessions(supabase, addDays(today, -2), today)]);
  // Las que da (o reemplaza) este profe; si lo reemplazan, no son suyas.
  const mine = sessions.filter(
    (s) =>
      s.status === "scheduled" &&
      (s.substituteProfileId === profile.id || (s.teacherProfileId === profile.id && !s.substituteProfileId)),
  );
  const days = [...new Set(mine.map((s) => s.date))].sort().reverse();

  return (
    <>
      <PageHeader
        title="Asistencia"
        subtitle="Elegí la clase para ver quiénes vinieron. Los ingresos los registra recepción cuando cada alumno llega."
      />
      {mine.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">No tenés clases hoy ni en los últimos 2 días.</p>
      ) : (
        days.map((date) => (
          <section key={date} className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-bold uppercase tracking-wide">{date === today ? `Hoy · ${longDate(date)}` : longDate(date)}</h2>
            <ul className="flex flex-col gap-2">
              {mine
                .filter((s) => s.date === date)
                .map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/profe/asistencia/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line p-3.5 text-ink no-underline hover:border-ink hover:text-ink"
                    >
                      <span className="flex flex-col">
                        <span className="font-semibold">{s.title}</span>
                        <span className="text-sm text-muted">
                          {s.start} a {s.end} · {s.roomName}
                        </span>
                      </span>
                      <span className="text-sm font-bold">Lista →</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
