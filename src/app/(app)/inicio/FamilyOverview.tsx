import Link from "next/link";
import { academyConfig } from "@/config/academy";
import { longDate } from "@/domain/classes/sessions";
import { formatARS } from "@/domain/shared/money";
import type { MyStudent } from "@/lib/active-student";
import { lightFor, loadCharges } from "@/lib/billing";
import { loadBalances, loadUpcomingBookings } from "@/lib/bookings";
import { loadActiveMemberships } from "@/lib/memberships";
import { loadPendingSignup } from "@/lib/signups";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const shortDay = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" });
const dm = (d: string) => shortDay.format(new Date(`${d}T12:00:00Z`));
const untilFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "numeric", timeZone: academyConfig.timeZone });

/** Inicio con "Todos": un resumen por persona de la familia y lo que se debe en total. */
export async function FamilyOverview({ supabase, people, today, graceDays }: { supabase: Client; people: MyStudent[]; today: string; graceDays: number }) {
  const data = await Promise.all(
    people.map(async (p) => {
      const [memberships, charges, balances, bookings, pending] = await Promise.all([
        loadActiveMemberships(supabase, p.id).catch(() => []),
        loadCharges(supabase, p.id).catch(() => []),
        loadBalances(supabase, p.id).catch(() => []),
        loadUpcomingBookings(supabase, p.id).catch(() => []),
        loadPendingSignup(supabase, p.id).catch(() => null),
      ]);
      const owed = charges.filter((c) => c.pendingCents > 0);
      return {
        person: p,
        memberships,
        lights: memberships.map((m) => ({ m, light: lightFor(charges.filter((c) => c.membershipId === m.id), today, graceDays) })),
        packs: balances.filter((b) => b.active && b.remaining > 0),
        bookings: bookings.filter((b) => !b.sessionCancelled).slice(0, 2),
        pending,
        owedCents: owed.reduce((s, c) => s + c.pendingCents, 0),
        owedCashCents: owed.reduce((s, c) => s + (c.cashCents ?? c.pendingCents), 0),
      };
    }),
  );
  const totalOwed = data.reduce((s, d) => s + d.owedCents, 0);
  const totalCash = data.reduce((s, d) => s + d.owedCashCents, 0);

  return (
    <>
      {totalOwed > 0 ? (
        <section className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-warn-soft p-4 text-warn-ink">
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Pendiente de toda la familia</span>
            {totalCash < totalOwed && <span className="text-sm">{formatARS(totalCash)} pagando en efectivo en recepción</span>}
          </span>
          <strong className="shrink-0 font-display text-2xl">{formatARS(totalOwed)}</strong>
        </section>
      ) : (
        <p className="rounded-xl bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-ink">
          <span aria-hidden="true">✓ </span>Nadie de la familia tiene pagos pendientes.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {data.map((d) => (
          <li key={d.person.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-display text-xl font-bold uppercase tracking-wide">{d.person.isSelf ? `${d.person.firstName} (vos)` : d.person.firstName}</span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {d.lights.map(({ m, light }) => (
                  <span
                    key={m.id}
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      light.light === "current" ? "bg-ok-soft text-ok-ink" : light.light === "grace" ? "bg-warn-soft text-warn-ink" : "bg-alert-soft text-alert-ink"
                    }`}
                  >
                    {light.light === "current" ? "CUOTA AL DÍA" : light.light === "grace" ? `EN GRACIA HASTA EL ${dm(light.graceEndsOn)}` : "ACCESO SUSPENDIDO"}
                  </span>
                ))}
                {d.owedCents > 0 && <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold">DEBE {formatARS(d.owedCents)}</span>}
              </span>
            </div>

            {d.memberships.flatMap((m) => m.enrollments).length > 0 && (
              <ul className="flex flex-col gap-1 text-[15px]">
                {d.memberships.flatMap((m) =>
                  m.enrollments.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">FIJA</span>
                      {e.label}
                    </li>
                  )),
                )}
              </ul>
            )}
            {d.bookings.length > 0 && (
              <ul className="flex flex-col gap-1 text-[15px]">
                {d.bookings.map((b) => (
                  <li key={b.id} className="flex items-center gap-2">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold">RESERVA</span>
                    {longDate(b.date)} {b.start} · {b.title}
                  </li>
                ))}
              </ul>
            )}
            {d.packs.map((b) => (
              <span key={b.id} className="text-sm text-muted">
                {b.name}: {b.remaining} {b.remaining === 1 ? "clase" : "clases"} hasta el {untilFormat.format(new Date(new Date(b.validUntil).getTime() - 1))}
              </span>
            ))}
            {d.pending && <span className="text-sm font-semibold text-warn-ink">Inscripción pendiente: pasá por recepción para pagar la cuota.</span>}
            {d.memberships.length === 0 && d.packs.length === 0 && d.bookings.length === 0 && !d.pending && (
              <span className="text-sm text-muted">Sin clases por ahora.</span>
            )}

            <a href={`/alumno?id=${d.person.id}&a=/inicio`} className="self-start text-sm font-semibold">
              Ver todo de {d.person.isSelf ? "vos" : d.person.firstName} ›
            </a>
          </li>
        ))}
      </ul>
      <Link href="/inscripcion?para=hijo" className="self-start text-[15px] font-semibold">
        Anotar a otro hijo/a
      </Link>
    </>
  );
}
