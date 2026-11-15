import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { TeacherAvatar } from "@/components/images/TeacherAvatar";
import { BOOKING_ERRORS, BOOKING_NOTICES } from "@/domain/bookings/messages";
import { otherPrice } from "@/domain/billing/cash-price";
import { weekdayLabel } from "@/domain/classes/schedule";
import { longDate, sessionBadges, teacherShown } from "@/domain/classes/sessions";
import { formatARS } from "@/domain/shared/money";
import { getActiveStudent } from "@/lib/active-student";
import { loadSurcharge } from "@/lib/billing";
import { cancelPreview, loadAvailability, loadBalances, loadUpcomingBookings } from "@/lib/bookings";
import { academyToday } from "@/lib/grilla";
import { imageUrl } from "@/lib/image-url";
import { loadActiveMemberships } from "@/lib/memberships";
import { loadPlans } from "@/lib/prices";
import { requireProfile } from "@/lib/session";
import { loadSession } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";
import { bookMySession, cancelMyBooking } from "../../actions";

export const metadata: Metadata = { title: "Clase" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Option({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-sm leading-snug text-muted">{description}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Una clase de una fecha, con todo lo que puede hacer el alumno (o su tutor):
 * reservar con su pack, comprar la clase suelta, comprar un pack o quedarse con
 * ese horario fijo todas las semanas (cuota de profe).
 */
export default async function ClasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const [, { id }, query, { active }] = await Promise.all([requireProfile(), params, searchParams, getActiveStudent()]);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const session = await loadSession(supabase, id);
  if (!session) notFound();

  const studentId = active?.id ?? null;
  const canBook = active?.canBook ?? false;
  const today = academyToday();
  const [avail, balances, bookings, memberships, plans, surcharge, teacher] = await Promise.all([
    loadAvailability(supabase, [id]),
    studentId ? loadBalances(supabase, studentId).catch(() => []) : Promise.resolve([]),
    studentId ? loadUpcomingBookings(supabase, studentId).catch(() => []) : Promise.resolve([]),
    studentId ? loadActiveMemberships(supabase, studentId).catch(() => []) : Promise.resolve([]),
    loadPlans(supabase, today).catch(() => []),
    loadSurcharge(supabase).catch(() => 0),
    session.substituteId ?? session.teacherId
      ? supabase.from("teachers").select("photo_path").eq("id", (session.substituteId ?? session.teacherId)!).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const a = avail.get(id);
  const booking = bookings.find((b) => b.sessionId === id) ?? null;
  const fixed = Boolean(session.scheduleId && memberships.some((m) => m.enrollments.some((e) => e.scheduleId === session.scheduleId)));
  const hasBalance = balances.some((b) => b.active);
  const bookable = session.status === "scheduled" && session.upcoming && session.allowsSingleBooking;
  const full = (a?.seatsLeft ?? 0) <= 0;
  const price = (kind: string) => {
    const p = plans.find((x) => x.kind === kind && x.active && x.current);
    return p?.current ? { cash: p.current.amountCents, other: otherPrice(p.current.amountCents, surcharge, p.current.otherCents) } : null;
  };
  const single = price("single_class");
  const monthly = price("teacher_monthly");
  const photo = imageUrl((teacher.data as { photo_path: string | null } | null)?.photo_path);
  const badges = sessionBadges(session);
  const weekday = weekdayLabel(new Date(`${session.date}T12:00:00Z`).getUTCDay()).toLowerCase();
  const back = `/clases/clase/${id}`;
  const who = active && !active.isSelf ? active.firstName : null;

  return (
    <>
      <Link href={`/clases?dia=${session.date}`} className="self-start text-sm font-semibold">
        ‹ Clases
      </Link>
      {query.aviso && BOOKING_NOTICES[query.aviso] && <FormAlert kind="ok">{BOOKING_NOTICES[query.aviso]}</FormAlert>}
      {query.error && BOOKING_ERRORS[query.error] && <FormAlert kind="error">{BOOKING_ERRORS[query.error]}</FormAlert>}

      <section className="flex flex-col gap-3">
        <span className="font-display text-lg font-bold uppercase tracking-wide text-brand-text">{longDate(session.date)}</span>
        <h1 className="font-display text-[32px] font-bold uppercase leading-none tracking-wide">{session.title}</h1>
        <span className="font-display text-2xl font-bold tabular-nums">
          {session.start} a {session.end}
        </span>
        <div className="flex items-center gap-3">
          <TeacherAvatar name={teacherShown(session)} url={photo} size={48} />
          <span className="flex flex-col">
            <span className="font-semibold">{teacherShown(session)}</span>
            <span className="text-sm text-muted">{session.roomName}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {fixed && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-paper">TU CLASE FIJA</span>}
          {booking && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-paper">RESERVADA</span>}
          {bookable && a && !fixed && !booking && (
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">
              {full ? "COMPLETA" : a.seatsLeft === 1 ? "QUEDA 1 LUGAR" : `QUEDAN ${a.seatsLeft} LUGARES`}
            </span>
          )}
          {badges.map((b) => (
            <span key={b.text} className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">
              {b.text}
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">{who ? `Anotar a ${who}` : "Anotate"}</h2>

        {!studentId && <p className="text-[15px] text-muted">Para anotarte, primero inscribite desde Inicio.</p>}

        {studentId && fixed && <Option title="Es tu clase fija" description="La tenés con tu cuota de profe: no hace falta reservarla. ¡Te esperamos!" />}

        {studentId && booking && (
          <Option
            title="Ya la reservaste"
            description={
              cancelPreview(booking.startsAt) === "a-tiempo"
                ? "Si no podés venir, cancelá con 12 horas o más y la clase vuelve a tu saldo."
                : "Faltan menos de 12 horas: si cancelás, la clase no se devuelve."
            }
          >
            {canBook && (
              <form action={cancelMyBooking}>
                <input type="hidden" name="booking_id" value={booking.id} />
                <input type="hidden" name="back" value={back} />
                <SmallSubmit tone="danger">Cancelar reserva</SmallSubmit>
              </form>
            )}
          </Option>
        )}

        {studentId && !fixed && !booking && session.status !== "scheduled" && (
          <Option title="Esta clase no se da" description={session.cancelReason ? `Motivo: ${session.cancelReason}` : "La academia la suspendió."} />
        )}
        {studentId && !fixed && !booking && session.status === "scheduled" && !session.upcoming && (
          <Option title="Esta clase ya empezó" description="Elegí otra fecha en Clases." />
        )}

        {studentId && !fixed && !booking && session.status === "scheduled" && session.upcoming && !session.allowsSingleBooking && (
          <Option title="Sólo con cuota de profe" description="Esta clase no tiene lugares sueltos: se toma con la cuota mensual (ver abajo)." />
        )}

        {studentId && !fixed && !booking && bookable && full && <Option title="Clase completa" description="No quedan lugares para esta fecha. Probá otro día." />}

        {studentId && !fixed && !booking && bookable && !full && hasBalance && (
          <Option title="Reservar con tu pack" description="Se descuenta 1 clase de tu pack (o crédito).">
            {canBook && (
              <form action={bookMySession}>
                <input type="hidden" name="session_id" value={id} />
                <input type="hidden" name="back" value={back} />
                <SmallSubmit tone="dark">Reservar esta clase</SmallSubmit>
              </form>
            )}
          </Option>
        )}

        {studentId && !fixed && !booking && bookable && !full && single && (
          <Option
            title="Clase suelta"
            description={`Sólo esta fecha. ${formatARS(single.other)} (${formatARS(single.cash)} en efectivo en recepción).`}
          >
            {canBook && (
              <Link href={`/compras/clase/${id}`} className="self-start rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper no-underline hover:text-paper">
                Comprar esta clase
              </Link>
            )}
          </Option>
        )}

        {studentId && !fixed && !booking && bookable && !hasBalance && (
          <Option title="Pack de clases" description="10 o 16 clases para usar en el mes, con cualquier profe y estilo.">
            <Link href="/compras" className="self-start text-sm font-semibold">
              Ver packs ›
            </Link>
          </Option>
        )}

        {studentId && !fixed && session.scheduleId && monthly && (
          <Option
            title={`Esta clase fija todos los ${weekday}`}
            description={`Con la cuota de profe tenés tu lugar fijo en 2 clases por semana. ${formatARS(monthly.other)} por mes (${formatARS(monthly.cash)} en efectivo).`}
          >
            <Link
              href={`/inscripcion?horario=${session.scheduleId}${who ? "&para=hijo" : ""}`}
              className="self-start text-sm font-semibold"
            >
              Inscribirme con cuota ›
            </Link>
          </Option>
        )}
      </section>
    </>
  );
}
