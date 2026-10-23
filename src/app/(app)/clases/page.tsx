import type { Metadata } from "next";
import { DayStrip } from "@/components/classes/DayStrip";
import { SessionCard } from "@/components/classes/SessionCard";
import { WeeklyGrid } from "@/components/classes/WeeklyGrid";
import { WorkshopList } from "@/components/classes/WorkshopList";
import { loadMyRegistrations, loadWorkshops, type WorkshopRow } from "@/lib/workshops";
import { FormAlert } from "@/components/forms/fields";
import { PageHeader } from "@/components/ui/basics";
import { dayStrip, longDate, pickDay } from "@/domain/classes/sessions";
import { academyToday, loadGroups, slotsOf } from "@/lib/grilla";
import { loadMyMemberships } from "@/lib/memberships";
import { requireProfile } from "@/lib/session";
import { ensureSessions, loadSessions } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";
import { SmallSubmit } from "@/components/forms/fields";
import { BOOKING_ERRORS, BOOKING_NOTICES } from "@/domain/bookings/messages";
import { type Availability, cancelPreview, loadAvailability, loadBalances, loadUpcomingBookings } from "@/lib/bookings";
import { loadMyStudentId } from "@/lib/billing";
import { bookMySession, cancelMyBooking } from "./actions";

export const metadata: Metadata = { title: "Clases" };

export default async function ClasesPage({ searchParams }: { searchParams: Promise<{ dia?: string; aviso?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  const strip = dayStrip(academyToday());
  const day = pickDay(params.dia, strip);

  const supabase = await createClient();
  let failed = false;
  let sessions: Awaited<ReturnType<typeof loadSessions>> = [];
  let slots: ReturnType<typeof slotsOf> = [];
  let fixedSchedules = new Set<string>();
  let workshops: WorkshopRow[] = [];
  let myWorkshops = new Set<string>();
  let availability = new Map<string, Availability>();
  const myBookings = new Map<string, { id: string; startsAt: string }>();
  let hasBalance = false;
  try {
    // Todo en paralelo: la generación diaria ya dejó listas las próximas semanas.
    const [, loaded, groups, mine, ws, myRegs] = await Promise.all([
      ensureSessions(supabase),
      loadSessions(supabase, day, day),
      loadGroups(supabase, { onlyActive: true }),
      loadMyMemberships(supabase, profile.id),
      loadWorkshops(supabase),
      loadMyRegistrations(supabase, profile.id),
    ]);
    const studentId = await loadMyStudentId(supabase, profile.id);
    const [avail, balances, bookings] = await Promise.all([
      loadAvailability(supabase, loaded.map((x) => x.id)),
      studentId ? loadBalances(supabase, studentId) : Promise.resolve([]),
      studentId ? loadUpcomingBookings(supabase, studentId) : Promise.resolve([]),
    ]);
    availability = avail;
    hasBalance = balances.some((b) => b.active);
    for (const b of bookings) myBookings.set(b.sessionId, { id: b.id, startsAt: b.startsAt });
    workshops = ws.filter((w) => w.status === "published" && !w.finished && w.sessions.length > 0);
    myWorkshops = new Set(myRegs.map((r) => r.workshopId));
    sessions = loaded;
    slots = slotsOf(groups);
    fixedSchedules = new Set(mine.flatMap((m) => m.enrollments.map((e) => e.scheduleId)));
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader title="Clases" />
      {params.aviso && BOOKING_NOTICES[params.aviso] && <FormAlert kind="ok">{BOOKING_NOTICES[params.aviso]}</FormAlert>}
      {params.error && BOOKING_ERRORS[params.error] && <FormAlert kind="error">{BOOKING_ERRORS[params.error]}</FormAlert>}
      {failed && <FormAlert kind="error">No pudimos cargar las clases. Recargá la página.</FormAlert>}

      {!failed && slots.length === 0 ? (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface p-5">
          <span className="font-display text-xl font-bold uppercase tracking-wide">Grilla en preparación</span>
          <p className="text-[15px] leading-snug text-muted">Muy pronto vas a ver acá los días y horarios de cada clase.</p>
        </section>
      ) : null}
      {!failed && slots.length === 0 && <WorkshopList workshops={workshops} mine={myWorkshops} />}
      {!(!failed && slots.length === 0) && (
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
                    {(() => {
                      const fixed = Boolean(s.scheduleId && fixedSchedules.has(s.scheduleId));
                      const booking = myBookings.get(s.id);
                      const a = availability.get(s.id);
                      const open = s.status === "scheduled" && s.upcoming && s.allowsSingleBooking && !fixed;
                      return (
                        <SessionCard
                          session={s}
                          tag={fixed ? "TU CLASE FIJA" : booking ? "RESERVADA" : undefined}
                          extra={open && !booking && a ? (a.seatsLeft === 0 ? "Completa" : a.seatsLeft === 1 ? "Queda 1 lugar" : `Quedan ${a.seatsLeft} lugares`) : undefined}
                        >
                          {booking && (
                            <form action={cancelMyBooking} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                              <input type="hidden" name="booking_id" value={booking.id} />
                              <input type="hidden" name="back" value="/clases" />
                              <input type="hidden" name="dia" value={day} />
                              <span className="text-sm text-muted">
                                {cancelPreview(booking.startsAt) === "a-tiempo"
                                  ? "Si cancelás ahora, la clase vuelve a tu saldo."
                                  : "Faltan menos de 12 h: si cancelás, la clase no se devuelve."}
                              </span>
                              <SmallSubmit tone="danger">Cancelar reserva</SmallSubmit>
                            </form>
                          )}
                          {open && !booking && a && a.seatsLeft > 0 && hasBalance && (
                            <form action={bookMySession} className="border-t border-line pt-3">
                              <input type="hidden" name="session_id" value={s.id} />
                              <input type="hidden" name="back" value="/clases" />
                              <input type="hidden" name="dia" value={day} />
                              <SmallSubmit tone="dark">Reservar</SmallSubmit>
                            </form>
                          )}
                        </SessionCard>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <WorkshopList workshops={workshops} mine={myWorkshops} />
          {!hasBalance && (
            <p className="rounded-xl bg-surface px-4 py-3 text-[15px] leading-snug">
              Para reservar clases sueltas necesitás un <strong>pack</strong> o una <strong>clase individual</strong>: pedilos en recepción.
              Tus clases fijas de la cuota no hace falta reservarlas.
            </p>
          )}
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
