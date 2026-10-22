import type { Metadata } from "next";
import { DayStrip } from "@/components/classes/DayStrip";
import { SessionCard } from "@/components/classes/SessionCard";
import { FormAlert, SelectField, SmallSubmit, TextField } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { dayStrip, longDate, pickDay } from "@/domain/classes/sessions";
import { canOpen } from "@/domain/navigation/menus";
import { academyToday, loadCatalog } from "@/lib/grilla";
import { ensureSessions, loadSessions, loadUpcomingExceptions } from "@/lib/sessions";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ERRORS, NOTICES } from "../messages";
import { SectionTabs } from "../SectionTabs";
import { addException, cancelSession, removeException, restoreSession, setSubstitute } from "./actions";

export const metadata: Metadata = { title: "Calendario de clases" };

const input = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; aviso?: string; error?: string }>;
}) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "clases")) return <NoAccess />;
  const canManage = can(profile.access, "classes.manage");

  const today = academyToday();
  const strip = dayStrip(today, 14);
  const day = pickDay(params.dia, strip);

  const supabase = await createClient();
  await ensureSessions(supabase);
  const [sessions, exceptions, catalog] = await Promise.all([
    loadSessions(supabase, day, day),
    loadUpcomingExceptions(supabase, today),
    canManage ? loadCatalog(supabase) : Promise.resolve(null),
  ]);
  const teachers = (catalog?.teachers ?? []).filter((t) => t.active);
  const dayException = exceptions.find((e) => e.date === day);

  const notice = params.aviso ? NOTICES[params.aviso] : undefined;
  const failure = params.error ? ERRORS[params.error] : undefined;

  return (
    <>
      <PageHeader title="Clases y grilla" subtitle="Las clases de cada día, generadas desde los horarios para las próximas 8 semanas." />
      <SectionTabs current="calendario" canManage={canManage} />
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-4">
          <DayStrip days={strip} selected={day} hrefFor={(d) => `/admin/clases/calendario?dia=${d}`} />
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">{longDate(day)}</h2>
          {dayException && (
            <p className="rounded-xl bg-alert-soft px-4 py-3 text-[15px] font-semibold text-alert-ink">
              {dayException.kind === "holiday" ? "Feriado" : "Cierre"}: {dayException.description}. Las clases de este día no se dictan.
            </p>
          )}
          {sessions.length === 0 ? (
            <p className="text-[15px] text-muted">No hay clases este día.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {sessions.map((s) => {
                const upcoming = s.upcoming;
                return (
                  <li key={s.id}>
                    <SessionCard session={s} extra={`Cupo ${s.capacity}`}>
                      {canManage && upcoming && s.status === "scheduled" && (
                        <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:flex-wrap sm:items-end">
                          <form action={setSubstitute} className="flex flex-1 items-end gap-2">
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="dia" value={day} />
                            <div className="min-w-0 flex-1">
                              <SelectField
                                name="teacher_id"
                                label="Reemplazo"
                                placeholder="Sin reemplazo"
                                defaultValue={s.substituteId ?? ""}
                                options={teachers.filter((t) => t.id !== s.teacherId).map((t) => ({ value: t.id, label: t.displayName }))}
                              />
                            </div>
                            <SmallSubmit>Guardar</SmallSubmit>
                          </form>
                          <details className="flex-1">
                            <summary className="cursor-pointer text-sm font-semibold text-alert-ink">Suspender esta clase</summary>
                            <form action={cancelSession} className="flex gap-2 pt-2">
                              <input type="hidden" name="id" value={s.id} />
                              <input type="hidden" name="dia" value={day} />
                              <label htmlFor={`motivo-${s.id}`} className="sr-only">
                                Motivo
                              </label>
                              <input id={`motivo-${s.id}`} name="reason" required maxLength={200} placeholder="Motivo (lo ven los alumnos)" className={`${input} flex-1`} />
                              <SmallSubmit tone="danger">Suspender</SmallSubmit>
                            </form>
                          </details>
                        </div>
                      )}
                      {canManage && upcoming && s.status === "cancelled" && !s.fromHoliday && (
                        <form action={restoreSession} className="border-t border-line pt-3">
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="dia" value={day} />
                          <SmallSubmit>Volver a programar</SmallSubmit>
                        </form>
                      )}
                    </SessionCard>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Feriados y cierres</h2>
          <p className="text-[15px] text-muted">Las clases de esos días quedan suspendidas. Si quitás el día, vuelven.</p>
          {exceptions.length === 0 ? (
            <p className="text-[15px] text-muted">No hay días cargados.</p>
          ) : (
            <ul className="flex flex-col">
              {exceptions.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5">
                  <span className="flex flex-col">
                    <span className="font-semibold">{longDate(e.date)}</span>
                    <span className="text-sm text-muted">
                      {e.kind === "holiday" ? "Feriado" : "Cierre"} · {e.description}
                    </span>
                  </span>
                  {canManage && (
                    <form action={removeException}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="dia" value={day} />
                      <SmallSubmit tone="danger">Quitar</SmallSubmit>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <form action={addException} className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-4">
              <input type="hidden" name="dia" value={day} />
              <span className="font-semibold">Agregar día sin clases</span>
              <TextField name="date" label="Fecha" type="date" required />
              <TextField name="description" label="Motivo" required hint="Lo ven los alumnos. Ej.: Feriado nacional." />
              <SelectField
                name="kind"
                label="Tipo"
                required
                defaultValue="holiday"
                options={[
                  { value: "holiday", label: "Feriado" },
                  { value: "closure", label: "Cierre de la academia" },
                ]}
              />
              <div>
                <SmallSubmit tone="dark">Agregar</SmallSubmit>
              </div>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
