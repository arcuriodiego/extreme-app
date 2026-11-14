import Link from "next/link";
import { TeacherAvatar } from "@/components/images/TeacherAvatar";
import { LinkCard } from "@/components/ui/basics";
import { longDate } from "@/domain/classes/sessions";
import { addDays, type CalendarDate } from "@/domain/shared/calendar-date";
import { loadAvailability } from "@/lib/bookings";
import { imageUrl } from "@/lib/image-url";
import { ensureSessions, loadSessions, type SessionRow } from "@/lib/sessions";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Clases que da este profe (propias o como reemplazo) y las que le cubre otro. */
function mineOnly(sessions: SessionRow[], profileId: string) {
  return sessions
    .filter((s) => s.substituteProfileId === profileId || (s.teacherProfileId === profileId && !s.substituteProfileId))
    .filter((s) => s.status !== "cancelled");
}

function minutes(s: SessionRow): number {
  const [h1 = 0, m1 = 0] = s.start.split(":").map(Number);
  const [h2 = 0, m2 = 0] = s.end.split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

function hoursLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Inicio de la vista de profe: saludo con su foto, sus clases de hoy con la lista,
 * la próxima clase y un resumen de la semana. Nada de inscripciones ni cuotas.
 */
export async function TeacherHome({
  supabase,
  profileId,
  firstName,
  today,
}: {
  supabase: Client;
  profileId: string;
  firstName: string | null;
  today: CalendarDate;
}) {
  const [{ data: teacher }] = await Promise.all([
    supabase.from("teachers").select("display_name, photo_path").eq("profile_id", profileId).maybeSingle(),
    ensureSessions(supabase),
  ]);
  const sessions = mineOnly(await loadSessions(supabase, today, addDays(today, 6)).catch(() => []), profileId);
  const todays = sessions.filter((s) => s.date === today);
  const upcomingToday = todays.filter((s) => s.upcoming);
  const next = sessions.find((s) => s.upcoming) ?? null;
  const avail = await loadAvailability(
    supabase,
    todays.map((s) => s.id),
  ).catch(() => new Map());
  const weekMinutes = sessions.reduce((sum, s) => sum + minutes(s), 0);

  const t = teacher as { display_name: string; photo_path: string | null } | null;
  const name = t?.display_name ?? firstName ?? "";
  const photo = imageUrl(t?.photo_path);

  return (
    <>
      <section className="flex items-center gap-4">
        <TeacherAvatar name={name || "Profe"} url={photo} size={72} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Hola{firstName ? `, ${firstName}` : ""}</h1>
          <span className="self-start rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">PROFE</span>
        </div>
      </section>

      {sessions.length === 0 ? (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border-[1.5px] border-ink p-5">
          <span className="font-display text-xl font-bold uppercase tracking-wide">¡Te damos la bienvenida al equipo!</span>
          <p className="text-[15px] leading-snug text-muted">
            Todavía no tenés clases asignadas esta semana. Cuando administración te asigne tus grupos, acá vas a ver tus clases del día, la lista de
            alumnos y tu próxima clase.
          </p>
          {!photo && <p className="text-sm text-muted">Pedile a administración que suba tu foto: así los alumnos te reconocen en la grilla.</p>}
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Hoy</h2>
            {todays.length === 0 ? (
              <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">Hoy no tenés clases. ¡Buen descanso!</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {todays.map((s) => {
                  const a = avail.get(s.id) as { fixed: number; booked: number; capacity: number } | undefined;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/profe/asistencia/${s.id}`}
                        className={`flex items-center justify-between gap-3 rounded-[var(--radius-card)] border p-4 text-ink no-underline hover:text-ink ${
                          s.upcoming ? "border-ink" : "border-line opacity-70"
                        }`}
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-display text-xl font-bold">
                            {s.start}–{s.end}
                          </span>
                          <span className="font-semibold">{s.title}</span>
                          <span className="text-sm text-muted">
                            {s.roomName}
                            {a ? ` · ${a.fixed + a.booked} ${a.fixed + a.booked === 1 ? "alumno" : "alumnos"}` : ""}
                            {s.substituteProfileId === profileId ? ` · Reemplazás a ${s.teacherName ?? "otro profe"}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold">Ver lista ›</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {next && upcomingToday.length === 0 && (
            <section className="flex flex-col gap-1 rounded-[var(--radius-card)] bg-surface p-5">
              <span className="text-sm font-semibold text-muted">Tu próxima clase</span>
              <span className="font-display text-xl font-bold uppercase tracking-wide">{longDate(next.date)}</span>
              <span className="text-[15px]">
                {next.start}–{next.end} · {next.title} · {next.roomName}
              </span>
            </section>
          )}

          <section className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5 rounded-[var(--radius-card)] border border-line p-4">
              <span className="font-display text-3xl font-bold">{sessions.length}</span>
              <span className="text-sm text-muted">{sessions.length === 1 ? "clase" : "clases"} en los próximos 7 días</span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-[var(--radius-card)] border border-line p-4">
              <span className="font-display text-3xl font-bold">{hoursLabel(weekMinutes)}</span>
              <span className="text-sm text-muted">de clase en los próximos 7 días</span>
            </div>
          </section>
        </>
      )}

      <div className="flex flex-col gap-3">
        <LinkCard href="/profe/clases" title="Mis clases" description="Tus clases de las próximas 2 semanas y tu grilla" />
        <LinkCard href="/profe/avisos" title="Mandar un aviso" description="A los alumnos de tus grupos" />
      </div>
    </>
  );
}
