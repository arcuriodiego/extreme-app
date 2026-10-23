import { SmallSubmit } from "@/components/forms/fields";
import { COUNTER_METHODS, PAYMENT_METHOD_LABELS } from "@/domain/billing/payments";
import { longDate } from "@/domain/classes/sessions";
import { addDays } from "@/domain/shared/calendar-date";
import { formatARS } from "@/domain/shared/money";
import { cancelPreview, loadAvailability, loadBalances, loadUpcomingBookings } from "@/lib/bookings";
import type { PlanWithPrices } from "@/lib/prices";
import { loadSessions } from "@/lib/sessions";
import type { createClient } from "@/lib/supabase/server";
import { bookForStudent, cancelStudentBooking, sellPack } from "../actions";

type Client = Awaited<ReturnType<typeof createClient>>;

const input = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

function MethodInputs({ idPrefix }: { idPrefix: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className="sr-only" htmlFor={`${idPrefix}-m`}>
        Medio de pago
      </label>
      <select id={`${idPrefix}-m`} name="method" defaultValue="cash" className={input}>
        {COUNTER_METHODS.map((m) => (
          <option key={m} value={m}>
            {PAYMENT_METHOD_LABELS[m]}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${idPrefix}-r`}>
        N° de operación
      </label>
      <input id={`${idPrefix}-r`} name="reference" maxLength={80} placeholder="N° de operación (opcional)" className={`${input} flex-1`} />
    </div>
  );
}

/** Packs, créditos y reservas del alumno; venta de packs y reservas desde recepción. */
export async function PacksSection({
  supabase,
  studentId,
  canPay,
  canManage,
  plans,
  today,
}: {
  supabase: Client;
  studentId: string;
  canPay: boolean;
  canManage: boolean;
  plans: PlanWithPrices[];
  today: string;
}) {
  const [balances, bookings, sessions, { data: fixedRows }] = await Promise.all([
    loadBalances(supabase, studentId),
    loadUpcomingBookings(supabase, studentId),
    canManage ? loadSessions(supabase, today, addDays(today, 13)) : Promise.resolve([]),
    supabase.from("enrollments").select("schedule_id").eq("student_id", studentId).eq("status", "active"),
  ]);
  // Sus clases fijas no se reservan: ya tiene el lugar.
  const fixedSchedules = new Set(((fixedRows ?? []) as { schedule_id: string }[]).map((r) => r.schedule_id));
  const bookable = sessions.filter(
    (s) => s.status === "scheduled" && s.upcoming && s.allowsSingleBooking && !(s.scheduleId && fixedSchedules.has(s.scheduleId)),
  );
  const availability = await loadAvailability(
    supabase,
    bookable.map((s) => s.id),
  );
  const booked = new Set(bookings.map((b) => b.sessionId));
  const options = bookable.filter((s) => (availability.get(s.id)?.seatsLeft ?? 0) > 0 && !booked.has(s.id));
  const packs = plans.filter((p) => p.kind === "pack" && p.active && p.current);
  const single = plans.find((p) => p.kind === "single_class" && p.active)?.current?.amountCents ?? null;
  const active = balances.filter((b) => b.active);
  const hasBalance = active.length > 0;

  return (
    <section id="packs" className="flex scroll-mt-6 flex-col gap-4 border-t border-line pt-6">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Packs y reservas</h2>

      {active.length === 0 ? (
        <p className="text-[15px] text-muted">No tiene packs ni créditos vigentes.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col">
          {active.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[15px]">
              <span>
                <strong>{b.name}</strong> · {b.kind === "credit" ? `reservar hasta el ${b.validUntilLabel}` : `vence el ${b.validUntilLabel}`}
              </span>
              <strong>
                {b.remaining}
                {b.kind === "pack" ? ` de ${b.total}` : ""}
              </strong>
            </li>
          ))}
        </ul>
      )}

      {bookings.length > 0 && (
        <div className="flex max-w-2xl flex-col gap-1">
          <span className="font-semibold">Próximas reservas</span>
          <ul className="flex flex-col">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2.5 text-[15px]">
                <span>
                  {longDate(b.date)} {b.start} · {b.title} ·{" "}
                  <span className="text-muted">{b.payKind === "pack" ? "con pack" : b.payKind === "credit" ? "con crédito" : "clase individual"}</span>
                </span>
                {canManage && (
                  <form action={cancelStudentBooking}>
                    <input type="hidden" name="student_id" value={studentId} />
                    <input type="hidden" name="booking_id" value={b.id} />
                    <SmallSubmit tone="danger">{cancelPreview(b.startsAt) === "a-tiempo" ? "Cancelar (se devuelve)" : "Cancelar (no se devuelve)"}</SmallSubmit>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid max-w-3xl gap-4 lg:grid-cols-2">
        {canPay && packs.length > 0 && (
          <form action={sellPack} className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
            <input type="hidden" name="student_id" value={studentId} />
            <span className="font-semibold">Vender un pack</span>
            <p className="text-sm text-muted">Se cobra el total y las clases quedan disponibles por 1 mes desde hoy.</p>
            <label className="sr-only" htmlFor="pack-plan">
              Pack
            </label>
            <select id="pack-plan" name="plan_id" required className={input}>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.current ? formatARS(p.current.amountCents) : ""}
                </option>
              ))}
            </select>
            <MethodInputs idPrefix="pack" />
            <div>
              <SmallSubmit tone="dark">Cobrar y cargar el pack</SmallSubmit>
            </div>
          </form>
        )}

        {canManage && (
          <form action={bookForStudent} className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
            <input type="hidden" name="student_id" value={studentId} />
            <span className="font-semibold">Reservar una clase</span>
            {options.length === 0 ? (
              <p className="text-sm text-muted">No hay clases con lugar en los próximos 14 días.</p>
            ) : (
              <>
                <label className="sr-only" htmlFor="reserva-clase">
                  Clase
                </label>
                <select id="reserva-clase" name="session_id" required className={input}>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {longDate(s.date)} {s.start} · {s.title} ({availability.get(s.id)?.seatsLeft} libres)
                    </option>
                  ))}
                </select>
                <fieldset className="flex flex-col gap-1.5 text-[15px]">
                  <legend className="sr-only">Cómo se paga</legend>
                  {hasBalance && (
                    <label className="flex items-center gap-2">
                      <input type="radio" name="mode" value="balance" defaultChecked className="size-4 accent-ink" />
                      Con su pack o crédito
                    </label>
                  )}
                  {canPay && single !== null && (
                    <label className="flex items-center gap-2">
                      <input type="radio" name="mode" value="single" defaultChecked={!hasBalance} className="size-4 accent-ink" />
                      Cobrar clase individual ({formatARS(single)})
                    </label>
                  )}
                </fieldset>
                {canPay && single !== null && <MethodInputs idPrefix="single" />}
                <div>
                  <SmallSubmit tone="dark">Reservar</SmallSubmit>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
