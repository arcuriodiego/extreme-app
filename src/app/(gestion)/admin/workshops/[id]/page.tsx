import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert, SelectField, SmallSubmit, TextField } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { COUNTER_METHODS, PAYMENT_METHOD_LABELS } from "@/domain/billing/payments";
import { longDate } from "@/domain/classes/sessions";
import { canOpen } from "@/domain/navigation/menus";
import { formatARS } from "@/domain/shared/money";
import { seatsLabel } from "@/domain/workshops/workshops";
import { academyConfig } from "@/config/academy";
import { academyToday, loadCatalog } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { searchStudents } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";
import { loadRegistrations, loadWorkshop, loadWorkshopWaitlist, refreshWorkshopWaitlists, refundPreview } from "@/lib/workshops";
import { PaymentFields, pesosText } from "../../alumnos/PaymentFields";
import {
  addWorkshopSession,
  cancelRegistration,
  cancelWorkshop,
  payRegistration,
  recordRefund,
  registerGuest,
  registerStudent,
  removeWorkshopImage,
  setWorkshopImage,
  removeFromWaitlist,
  removeWorkshopSession,
  waitlistGuest,
  waitlistStudent,
  setPublished,
  updateWorkshop,
} from "../actions";
import { ERRORS, NOTICES, STATUS } from "../messages";
import { WorkshopForm } from "../WorkshopForm";
import { ImagePicker } from "@/components/images/ImagePicker";

export const metadata: Metadata = { title: "Workshop" };

/** Medio y referencia del pago total, para inscribir. */
function PayInputs({ idPrefix }: { idPrefix: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className="sr-only" htmlFor={`${idPrefix}-medio`}>
        Medio de pago
      </label>
      <select id={`${idPrefix}-medio`} name="method" defaultValue="cash" className={input}>
        {COUNTER_METHODS.map((m) => (
          <option key={m} value={m}>
            {PAYMENT_METHOD_LABELS[m]}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${idPrefix}-ref`}>
        N° de operación
      </label>
      <input id={`${idPrefix}-ref`} name="reference" maxLength={80} placeholder="N° de operación (opcional)" className={`${input} min-w-0 flex-1`} />
    </div>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const input = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";
const dateTime = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: academyConfig.timeZone,
});

export default async function WorkshopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string; q?: string }>;
}) {
  const [profile, { id }, query] = await Promise.all([requireProfile(), params, searchParams]);
  if (!canOpen(profile.access, "workshops")) return <NoAccess />;
  if (!UUID.test(id)) notFound();
  const canManage = can(profile.access, "classes.manage");
  const canPay = can(profile.access, "payments.register");

  const supabase = await createClient();
  const q = (query.q ?? "").trim().slice(0, 80);
  const seesPeople = canPay || can(profile.access, "people.view");
  if (seesPeople) await refreshWorkshopWaitlists(supabase);
  const [workshop, registrations, catalog, found, waitlist] = await Promise.all([
    loadWorkshop(supabase, id),
    canPay || can(profile.access, "people.view") ? loadRegistrations(supabase, id) : Promise.resolve([]),
    canManage ? loadCatalog(supabase) : Promise.resolve(null),
    q && canPay ? searchStudents(supabase, q) : Promise.resolve({ rows: [], error: false }),
    seesPeople ? loadWorkshopWaitlist(supabase, id) : Promise.resolve([]),
  ]);
  if (!workshop) notFound();

  const active = registrations.filter((r) => r.status === "confirmed");
  const toRefund = registrations.filter((r) => r.status === "cancelled" && r.refundCents > r.refundedCents);
  const open = workshop.status === "published" && !workshop.finished && workshop.sessions.length > 0;
  const { deadline } = refundPreview(workshop.firstStart, 0);
  const notice = query.aviso ? NOTICES[query.aviso] : undefined;
  const failure = query.error ? ERRORS[query.error] : undefined;
  const rooms = (catalog?.rooms ?? []).filter((r) => r.active);
  const registeredIds = new Set(active.map((r) => r.studentId));
  const waitingIds = new Set(waitlist.map((w) => w.studentId));
  const full = workshop.taken + workshop.held >= workshop.capacity;

  return (
    <>
      <Link href="/admin/workshops" className="self-start text-sm font-semibold">
        ‹ Workshops
      </Link>
      <div className="flex flex-col gap-2">
        <PageHeader
          title={workshop.title}
          subtitle={[workshop.teacherName, formatARS(workshop.priceCents), `${workshop.taken} de ${workshop.capacity} inscriptos${workshop.held > 0 ? ` · ${workshop.held} ${workshop.held === 1 ? "lugar guardado" : "lugares guardados"}` : ""}`]
            .filter(Boolean)
            .join(" · ")}
        />
        <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[workshop.status].style}`}>
          {STATUS[workshop.status].label}
        </span>
      </div>
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      {canManage && workshop.status === "draft" && (
        <div className="flex max-w-xl flex-col gap-3 rounded-[var(--radius-card)] border-[1.5px] border-ink p-4">
          <p className="text-[15px]">
            <strong>Es un borrador:</strong> los alumnos todavía no lo ven y no se puede inscribir.
            {workshop.sessions.length === 0 ? " Primero agregale al menos una fecha (más abajo)." : ""}
          </p>
          <form action={setPublished}>
            <input type="hidden" name="id" value={workshop.id} />
            <input type="hidden" name="publish" value="true" />
            <SmallSubmit tone="dark">Publicar workshop</SmallSubmit>
          </form>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Fechas</h2>
        {workshop.sessions.length === 0 ? (
          <p className="text-[15px] text-muted">Todavía no tiene fechas.</p>
        ) : (
          <ul className="flex max-w-xl flex-col">
            {workshop.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[15px]">
                <span>
                  <strong>{longDate(s.date)}</strong> · {s.start} a {s.end} · {s.roomName}
                </span>
                {canManage && workshop.status !== "cancelled" && (
                  <form action={removeWorkshopSession}>
                    <input type="hidden" name="workshop_id" value={workshop.id} />
                    <input type="hidden" name="session_id" value={s.id} />
                    <SmallSubmit tone="danger">Quitar</SmallSubmit>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {deadline && workshop.status !== "cancelled" && (
          <p className="text-sm text-muted">Se puede cancelar con devolución hasta el {dateTime.format(deadline)} (48 h antes).</p>
        )}
        {canManage && workshop.status !== "cancelled" && rooms.length > 0 && (
          <form action={addWorkshopSession} className="flex max-w-xl flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
            <input type="hidden" name="workshop_id" value={workshop.id} />
            <span className="font-semibold">Agregar fecha</span>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="date" label="Fecha" type="date" required defaultValue={academyToday()} />
              <SelectField name="room_id" label="Sala" required placeholder="Elegí…" options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
              <TextField name="start" label="Desde" type="time" required />
              <TextField name="end" label="Hasta" type="time" required />
            </div>
            <div>
              <SmallSubmit tone="dark">Agregar fecha</SmallSubmit>
            </div>
          </form>
        )}
      </section>

      {(workshop.imageUrl || (canManage && workshop.status !== "cancelled")) && (
        <section className="flex flex-col gap-3 border-t border-line pt-6">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Flyer</h2>
          {canManage && workshop.status !== "cancelled" ? (
            <>
              <p className="text-[15px] text-muted">
                {workshop.imageUrl
                  ? "Los alumnos lo ven arriba de todo en la info del workshop. Podés cambiarlo por otro."
                  : "Subí el flyer o una foto: los alumnos lo ven arriba de todo en la info del workshop."}
              </p>
              <form action={setWorkshopImage} className="flex max-w-xl flex-col gap-3">
                <input type="hidden" name="id" value={workshop.id} />
                <ImagePicker kind="workshops" current={workshop.imageUrl} label={workshop.imageUrl ? "Cambiar el flyer" : "Elegir el flyer"} submitLabel="Subir flyer" />
              </form>
              {workshop.imageUrl && (
                <form action={removeWorkshopImage}>
                  <input type="hidden" name="id" value={workshop.id} />
                  <SmallSubmit tone="danger">Quitar el flyer</SmallSubmit>
                </form>
              )}
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workshop.imageUrl!} alt={`Flyer de ${workshop.title}`} className="max-h-80 w-auto max-w-full self-start rounded-xl border border-line" />
          )}
        </section>
      )}

      {(canPay || active.length > 0) && (
        <section className="flex flex-col gap-3 border-t border-line pt-6">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            Inscriptos ({active.length}/{workshop.capacity})
          </h2>
          {active.length === 0 && <p className="text-[15px] text-muted">Todavía no hay inscriptos.</p>}
          <ul className="flex max-w-2xl flex-col">
            {active.map((r) => {
              const pending = r.totalCents - r.paidCents;
              const { refund } = refundPreview(workshop.firstStart, r.paidCents);
              return (
                <li key={r.id} className="flex flex-col gap-2 border-t border-line py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/alumnos/${r.studentId}`} className="font-semibold">
                        {r.name}
                      </Link>
                      {r.isGuest && <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold">SIN CUENTA</span>}
                      {r.phone && <span className="text-sm text-muted">{r.phone}</span>}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${pending === 0 ? "bg-ok-soft text-ok-ink" : "bg-warn-soft text-warn-ink"}`}
                    >
                      {pending === 0 ? "PAGADO" : `DEBE ${formatARS(pending)}`}
                    </span>
                  </div>
                  {canPay && (
                    <div className="flex flex-wrap gap-4">
                      {pending > 0 && (
                        <details className="min-w-0 flex-1">
                          <summary className="cursor-pointer text-sm font-semibold">Cobrar</summary>
                          <form action={payRegistration} className="flex flex-col gap-3 pt-2">
                            <input type="hidden" name="workshop_id" value={workshop.id} />
                            <input type="hidden" name="charge_id" value={r.chargeId} />
                            <input type="hidden" name="pending_cents" value={pending} />
                            <PaymentFields idPrefix={`w-${r.id}`} defaultPesos={pesosText(pending)} />
                            <div>
                              <SmallSubmit tone="dark">Registrar pago</SmallSubmit>
                            </div>
                          </form>
                        </details>
                      )}
                      <details className="min-w-0 flex-1">
                        <summary className="cursor-pointer text-sm font-semibold text-alert-ink">Cancelar inscripción</summary>
                        <form action={cancelRegistration} className="flex flex-col gap-2 pt-2">
                          <input type="hidden" name="workshop_id" value={workshop.id} />
                          <input type="hidden" name="registration_id" value={r.id} />
                          <p className="text-sm">
                            {r.paidCents === 0
                              ? "No pagó nada: se cancela sin deuda."
                              : refund > 0
                                ? `Faltan 48 h o más: corresponde devolverle ${formatARS(refund)}.`
                                : "Faltan menos de 48 h: no corresponde devolución."}
                          </p>
                          <input name="reason" maxLength={200} placeholder="Motivo (opcional)" className={input} />
                          <div>
                            <SmallSubmit tone="danger">Cancelar inscripción</SmallSubmit>
                          </div>
                        </form>
                      </details>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {toRefund.length > 0 && (
            <div className="flex max-w-2xl flex-col gap-2 rounded-xl bg-warn-soft p-4">
              <span className="font-semibold text-warn-ink">Devoluciones pendientes</span>
              {toRefund.map((r) => (
                <form key={r.id} action={recordRefund} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="workshop_id" value={workshop.id} />
                  <input type="hidden" name="registration_id" value={r.id} />
                  <span className="min-w-0 flex-1 text-[15px]">
                    {r.name}: <strong>{formatARS(r.refundCents - r.refundedCents)}</strong>
                  </span>
                  <label className="sr-only" htmlFor={`dev-${r.id}`}>
                    Medio de la devolución
                  </label>
                  <select id={`dev-${r.id}`} name="method" defaultValue="cash" className={input}>
                    {COUNTER_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                  <SmallSubmit tone="dark">Ya lo devolví</SmallSubmit>
                </form>
              ))}
            </div>
          )}

          {(waitlist.length > 0 || (open && full)) && (
            <div className="flex max-w-2xl flex-col gap-2 rounded-[var(--radius-card)] border border-line p-4">
              <span className="font-semibold">Lista de espera ({waitlist.length})</span>
              <p className="text-sm text-muted">
                Si se libera un lugar, se le guarda 24 h al primero de la lista y le avisamos en la app. Si no tiene la app, llamalo.
                Para quedarse con el lugar tiene que pagar el total.
              </p>
              {waitlist.length === 0 ? (
                <p className="text-[15px] text-muted">Nadie en espera.</p>
              ) : (
                <ol className="flex flex-col">
                  {waitlist.map((e) => (
                    <li key={e.id} className={`flex flex-col gap-2 border-t border-line py-2.5 ${e.status === "offered" ? "bg-ok-soft px-2" : ""}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold tabular-nums">{e.position}°</span>
                          <Link href={`/admin/alumnos/${e.studentId}`} className="font-semibold">
                            {e.name}
                          </Link>
                          {e.phone && <span className="text-sm text-muted">{e.phone}</span>}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${e.status === "offered" ? "bg-ok text-white" : "bg-surface"}`}>
                          {e.status === "offered" && e.offerExpiresAt
                            ? `LUGAR GUARDADO HASTA ${dateTime.format(new Date(e.offerExpiresAt)).toUpperCase()}`
                            : "ESPERANDO"}
                        </span>
                      </div>
                      {canPay && (
                        <div className="flex flex-wrap gap-4">
                          {e.status === "offered" && (
                            <details className="min-w-0 flex-1">
                              <summary className="cursor-pointer text-sm font-semibold">Cobrar e inscribir</summary>
                              <form action={registerStudent} className="flex flex-col gap-2 pt-2">
                                <input type="hidden" name="workshop_id" value={workshop.id} />
                                <input type="hidden" name="student_id" value={e.studentId} />
                                <PayInputs idPrefix={`le-${e.id}`} />
                                <div>
                                  <SmallSubmit tone="dark">Cobrar {formatARS(workshop.priceCents)} e inscribir</SmallSubmit>
                                </div>
                              </form>
                            </details>
                          )}
                          <form action={removeFromWaitlist}>
                            <input type="hidden" name="workshop_id" value={workshop.id} />
                            <input type="hidden" name="entry_id" value={e.id} />
                            <SmallSubmit tone="danger">{e.status === "offered" ? "No lo quiere: pasar al siguiente" : "Sacar de la lista"}</SmallSubmit>
                          </form>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {canPay && open && (
            <div className="grid max-w-3xl gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
                <span className="font-semibold">{full ? "Anotar a un alumno en la lista de espera" : "Inscribir a un alumno"}</span>
                <p className="text-sm text-muted">
                  {full ? "El workshop está completo." : "Sólo con el pago total: se cobra e inscribe en un solo paso."}
                </p>
                <form method="get" action={`/admin/workshops/${workshop.id}`} className="flex gap-2">
                  <label htmlFor="buscar" className="sr-only">
                    Buscar alumno
                  </label>
                  <input id="buscar" name="q" type="search" defaultValue={q} placeholder="Nombre, apellido o DNI" className={`${input} flex-1`} />
                  <SmallSubmit>Buscar</SmallSubmit>
                </form>
                {q && found.rows.length === 0 && <p className="text-sm text-muted">No encontramos a nadie. Si es de afuera, usá el formulario de al lado.</p>}
                <ul className="flex flex-col">
                  {found.rows.slice(0, 8).map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-[15px]">
                      <span className="min-w-0 truncate">
                        {s.name}
                        {s.dni ? <span className="text-sm text-muted"> · DNI {s.dni}</span> : null}
                      </span>
                      {registeredIds.has(s.id) ? (
                        <span className="text-sm text-muted">Inscripto</span>
                      ) : waitingIds.has(s.id) ? (
                        <span className="text-sm text-muted">En la lista de espera</span>
                      ) : full ? (
                        <form action={waitlistStudent}>
                          <input type="hidden" name="workshop_id" value={workshop.id} />
                          <input type="hidden" name="student_id" value={s.id} />
                          <SmallSubmit>Anotar en la lista</SmallSubmit>
                        </form>
                      ) : (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold">Cobrar e inscribir</summary>
                          <form action={registerStudent} className="flex flex-col gap-2 pt-2">
                            <input type="hidden" name="workshop_id" value={workshop.id} />
                            <input type="hidden" name="student_id" value={s.id} />
                            <PayInputs idPrefix={`al-${s.id}`} />
                            <div>
                              <SmallSubmit tone="dark">Cobrar {formatARS(workshop.priceCents)} e inscribir</SmallSubmit>
                            </div>
                          </form>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <form action={full ? waitlistGuest : registerGuest} className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
                <input type="hidden" name="workshop_id" value={workshop.id} />
                <span className="font-semibold">{full ? "Anotar a alguien de afuera en la lista de espera" : "Inscribir a alguien de afuera"}</span>
                <p className="text-sm text-muted">Le creamos una ficha sin cuenta (Ocasional). Si ya vino antes con el mismo DNI, se usa su ficha.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input name="first_name" required maxLength={80} placeholder="Nombre" aria-label="Nombre" className={input} />
                  <input name="last_name" maxLength={80} placeholder="Apellido" aria-label="Apellido" className={input} />
                  <input name="phone" inputMode="tel" placeholder="Teléfono" aria-label="Teléfono" className={input} />
                  <input name="dni" inputMode="numeric" placeholder="DNI (opcional)" aria-label="DNI" className={input} />
                </div>
                {!full && <PayInputs idPrefix="externo" />}
                <div>
                  <SmallSubmit tone="dark">{full ? "Anotar en la lista de espera" : `Cobrar ${formatARS(workshop.priceCents)} e inscribir`}</SmallSubmit>
                </div>
              </form>
            </div>
          )}
          {canPay && !open && workshop.status !== "cancelled" && (
            <p className="text-sm text-muted">
              {workshop.status === "draft" ? "Publicá el workshop para empezar a inscribir." : "El workshop ya pasó: no se puede inscribir."}
            </p>
          )}
        </section>
      )}

      {canManage && workshop.status !== "cancelled" && (
        <section className="flex flex-col gap-4 border-t border-line pt-6">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Datos</h2>
          {workshop.status === "published" && (
            <form action={setPublished}>
              <input type="hidden" name="id" value={workshop.id} />
              <input type="hidden" name="publish" value="false" />
              <SmallSubmit>Volver a borrador (los alumnos dejan de verlo)</SmallSubmit>
            </form>
          )}
          <WorkshopForm workshop={workshop} action={updateWorkshop} />
          <details className="max-w-xl">
            <summary className="cursor-pointer font-semibold text-alert-ink">Cancelar el workshop</summary>
            <div className="flex flex-col gap-2 pt-2">
              <p className="text-[15px] text-muted">
                Se cancelan todas las inscripciones y se liberan las salas. A quienes pagaron les corresponde la devolución completa.
              </p>
              <form action={cancelWorkshop}>
                <input type="hidden" name="id" value={workshop.id} />
                <SmallSubmit tone="danger">Sí, cancelar el workshop</SmallSubmit>
              </form>
            </div>
          </details>
        </section>
      )}

      <p className="text-sm text-muted">{seatsLabel(workshop.capacity, workshop.taken + workshop.held)}</p>
    </>
  );
}
