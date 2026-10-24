import type { Metadata } from "next";
import { MyQr } from "@/components/access/MyQr";
import { currentTimeMs } from "@/domain/access/qr";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { PageHeader } from "@/components/ui/basics";
import { BOOKING_ERRORS, BOOKING_NOTICES } from "@/domain/bookings/messages";
import { longDate } from "@/domain/classes/sessions";
import { cancelPreview, loadBalances, loadUpcomingBookings } from "@/lib/bookings";
import { loadActiveMemberships } from "@/lib/memberships";
import { getActiveStudent } from "@/lib/active-student";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { cancelMyBooking } from "../clases/actions";

export const metadata: Metadata = { title: "Mis pases" };

export default async function PasesPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const [, params, { active: student }] = await Promise.all([requireProfile(), searchParams, getActiveStudent()]);
  const supabase = await createClient();
  const studentId = student?.id ?? null;
  const child = student !== null && !student.isSelf;
  const [memberships, balances, bookings, key] = await Promise.all([
    studentId ? loadActiveMemberships(supabase, studentId).catch(() => []) : [],
    studentId ? loadBalances(supabase, studentId) : [],
    studentId ? loadUpcomingBookings(supabase, studentId) : [],
    studentId
      ? supabase.rpc("my_access_key", { p_student_id: studentId }).then((r) => r.data as { student_id: string; secret: string } | null)
      : null,
  ]);
  const serverNow = currentTimeMs();
  const active = balances.filter((b) => b.active);

  return (
    <>
      <PageHeader title={child ? `Pases de ${student.firstName}` : "Mis pases"} />
      {params.aviso && BOOKING_NOTICES[params.aviso] && <FormAlert kind="ok">{BOOKING_NOTICES[params.aviso]}</FormAlert>}
      {params.error && BOOKING_ERRORS[params.error] && <FormAlert kind="error">{BOOKING_ERRORS[params.error]}</FormAlert>}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">{child ? "Pase de entrada" : "Tu pase de entrada"}</h2>
        {key ? (
          <>
            <MyQr
              studentId={key.student_id}
              secret={key.secret}
              serverNow={serverNow}
              name={student?.name || "Tu pase"}
            />
            <p className="text-sm text-muted">
              {child
                ? `Mostralo en recepción cuando ${student.firstName} llega a la clase: queda registrada su asistencia.`
                : "Mostralo en recepción al llegar: queda registrada tu asistencia a la clase."}
            </p>
          </>
        ) : (
          <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">Tu cuenta todavía no tiene ficha de alumno. Pedila en recepción.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">Tus clases disponibles</h2>
        {active.length === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">
            No tenés packs ni créditos vigentes. Podés comprar un pack de 10 o 16 clases en recepción.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{b.name}</span>
                  <span className="text-sm text-muted">
                    {b.kind === "credit" ? `Reservá hasta el ${b.validUntilLabel}` : `Vence el ${b.validUntilLabel}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <strong className="font-display text-3xl leading-none">{b.remaining}</strong>
                  <span className="block text-xs text-muted">
                    {b.kind === "credit" ? (b.remaining === 1 ? "clase" : "clases") : `de ${b.total} clases`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">Tus reservas</h2>
        {bookings.length === 0 ? (
          <p className="text-[15px] text-muted">No tenés reservas próximas. Reservá desde Clases.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 rounded-xl border border-line p-4">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{b.title}</span>
                  <span className="text-sm text-muted">
                    {longDate(b.date)} · {b.start} a {b.end} · {b.roomName}
                  </span>
                </span>
                <form action={cancelMyBooking} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                  <input type="hidden" name="booking_id" value={b.id} />
                  <input type="hidden" name="back" value="/pases" />
                  <span className="text-sm text-muted">
                    {cancelPreview(b.startsAt) === "a-tiempo" ? "Cancelando ahora, la clase se devuelve." : "Faltan menos de 12 h: no se devuelve."}
                  </span>
                  <SmallSubmit tone="danger">Cancelar</SmallSubmit>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {memberships.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide">Tus clases fijas</h2>
          <ul className="flex flex-col gap-1.5 rounded-xl border border-line p-4 text-[15px]">
            {memberships.flatMap((m) =>
              m.enrollments.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">FIJA</span>
                  {e.label}
                </li>
              )),
            )}
          </ul>
        </section>
      )}

    </>
  );
}
