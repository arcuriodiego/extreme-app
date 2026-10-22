import { SmallSubmit } from "@/components/forms/fields";
import { AccessLight } from "@/components/status/AccessLight";
import { formatARS } from "@/domain/shared/money";
import { periodLabel } from "@/domain/billing/payments";
import { type ChargeRow, lightFor } from "@/lib/billing";
import { loadCatalog, loadGroups } from "@/lib/grilla";
import { loadActiveMemberships, loadFixedCounts, scheduleOptions } from "@/lib/memberships";
import type { createClient } from "@/lib/supabase/server";
import { changeEnrollment, endMembership, enrollStudent, registerChargePayment, registerFirstPayment } from "../actions";
import { PaymentFields, pesosText } from "../PaymentFields";

type Client = Awaited<ReturnType<typeof createClient>>;

const select = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

/** Cuotas de profe del alumno: horarios fijos, cambios, baja e inscripción nueva. */
export async function MembershipSection({
  supabase,
  studentId,
  canManage,
  pickedTeacher,
  pickedCategory,
  canPay,
  charges,
  today,
  graceDays,
  monthlyPriceCents,
}: {
  supabase: Client;
  studentId: string;
  canManage: boolean;
  canPay: boolean;
  charges: ChargeRow[];
  today: string;
  graceDays: number;
  monthlyPriceCents: number | null;
  pickedTeacher?: string;
  pickedCategory?: string;
}) {
  const [memberships, groups, fixed, catalog] = await Promise.all([
    loadActiveMemberships(supabase, studentId),
    loadGroups(supabase, { onlyActive: true }),
    loadFixedCounts(supabase),
    loadCatalog(supabase),
  ]);

  // Profes y categorías que tienen al menos un grupo activo con horarios.
  const teachers = catalog.teachers.filter((t) => groups.some((g) => g.teacherId === t.id && g.schedules.length > 0));
  const categories = catalog.ageCategories.filter((c) => groups.some((g) => g.ageCategoryId === c.id && g.schedules.length > 0));
  const picked =
    pickedTeacher && pickedCategory && teachers.some((t) => t.id === pickedTeacher) && categories.some((c) => c.id === pickedCategory)
      ? scheduleOptions(groups, pickedTeacher, pickedCategory, fixed)
      : null;

  return (
    <section id="planes" className="flex scroll-mt-6 flex-col gap-4 border-t border-line pt-6">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Cuota de profe</h2>

      {memberships.length === 0 && <p className="text-[15px] text-muted">No tiene cuota de profe activa.</p>}

      {memberships.map((m) => {
        const options = scheduleOptions(groups, m.teacherId, m.ageCategoryId, fixed);
        const mine = new Set(m.enrollments.map((e) => e.scheduleId));
        return (
          <article key={m.id} className="flex max-w-2xl flex-col gap-3 rounded-[var(--radius-card)] border border-line p-4">
            <div className="flex flex-col gap-1">
              <span className="font-semibold">
                {m.planName} · Prof. {m.teacherName} · {m.ageCategoryName}
              </span>
              {m.anchorDay === null && (
                <span className="self-start rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn-ink">
                  FALTA REGISTRAR EL PRIMER PAGO
                </span>
              )}
            </div>

            {m.anchorDay === null && canPay && monthlyPriceCents !== null && (
              <form action={registerFirstPayment} className="flex flex-col gap-3 rounded-xl bg-surface p-3">
                <input type="hidden" name="student_id" value={studentId} />
                <input type="hidden" name="membership_id" value={m.id} />
                <input type="hidden" name="pending_cents" value={monthlyPriceCents} />
                <p className="text-sm">
                  <strong>Primer pago</strong> · {formatARS(monthlyPriceCents)}. El día de hoy queda como vencimiento de cada mes.
                </p>
                <PaymentFields idPrefix={`primer-${m.id}`} defaultPesos={pesosText(monthlyPriceCents)} />
                <div>
                  <SmallSubmit tone="dark">Registrar pago</SmallSubmit>
                </div>
              </form>
            )}

            {m.anchorDay !== null && (() => {
              const mine = charges.filter((c) => c.membershipId === m.id);
              return (
                <>
                  <AccessLight state={lightFor(mine, today, graceDays)} planName={`Vence el ${m.anchorDay} de cada mes`} />
                  <ul className="flex flex-col">
                    {mine.slice(0, 4).map((c) => (
                      <li key={c.id} className="flex flex-col gap-2 border-t border-line py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                          <span>
                            {c.periodStart && c.periodEnd ? periodLabel(c.periodStart, c.periodEnd) : c.description}
                          </span>
                          <span className="flex items-center gap-2">
                            <strong>{formatARS(c.totalCents)}</strong>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                c.status === "paid" ? "bg-ok-soft text-ok-ink" : "bg-warn-soft text-warn-ink"
                              }`}
                            >
                              {c.status === "paid" ? "PAGADA" : c.status === "partially_paid" ? `DEBE ${formatARS(c.pendingCents)}` : "PENDIENTE"}
                            </span>
                          </span>
                        </div>
                        {canPay && c.pendingCents > 0 && (
                          <details>
                            <summary className="cursor-pointer text-sm font-semibold">Cobrar</summary>
                            <form action={registerChargePayment} className="flex flex-col gap-3 pt-2">
                              <input type="hidden" name="student_id" value={studentId} />
                              <input type="hidden" name="charge_id" value={c.id} />
                              <input type="hidden" name="pending_cents" value={c.pendingCents} />
                              <PaymentFields idPrefix={`cargo-${c.id}`} defaultPesos={pesosText(c.pendingCents)} />
                              <div>
                                <SmallSubmit tone="dark">Registrar pago</SmallSubmit>
                              </div>
                            </form>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
            <ul className="flex flex-col">
              {m.enrollments.map((e) => (
                <li key={e.id} className="flex flex-col gap-2 border-t border-line py-2.5">
                  <span className="text-[15px]">{e.label}</span>
                  {canManage && (
                    <form action={changeEnrollment} className="flex gap-2">
                      <input type="hidden" name="student_id" value={studentId} />
                      <input type="hidden" name="enrollment_id" value={e.id} />
                      <label htmlFor={`cambio-${e.id}`} className="sr-only">
                        Cambiar a otro horario
                      </label>
                      <select id={`cambio-${e.id}`} name="schedule_id" required defaultValue="" className={`${select} flex-1`}>
                        <option value="" disabled>
                          Cambiar a…
                        </option>
                        {options
                          .filter((o) => !mine.has(o.scheduleId))
                          .map((o) => (
                            <option key={o.scheduleId} value={o.scheduleId} disabled={o.left === 0}>
                              {o.label} — {o.left === 0 ? "completo" : `${o.left} libres`}
                            </option>
                          ))}
                      </select>
                      <SmallSubmit>Cambiar</SmallSubmit>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {canManage && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-alert-ink">Dar de baja esta cuota</summary>
                <form action={endMembership} className="flex gap-2 pt-2">
                  <input type="hidden" name="student_id" value={studentId} />
                  <input type="hidden" name="membership_id" value={m.id} />
                  <label htmlFor={`baja-${m.id}`} className="sr-only">
                    Motivo de la baja
                  </label>
                  <input id={`baja-${m.id}`} name="reason" maxLength={200} placeholder="Motivo (opcional)" className={`${select} flex-1`} />
                  <SmallSubmit tone="danger">Dar de baja</SmallSubmit>
                </form>
              </details>
            )}
          </article>
        );
      })}

      {canManage && (
        <div className="flex max-w-2xl flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
          <span className="font-semibold">Inscribir en una cuota de profe</span>
          {teachers.length === 0 ? (
            <p className="text-[15px] text-muted">Todavía no hay grupos activos con profe y horarios.</p>
          ) : (
            <>
              {/* Paso 1: profe y categoría (recarga la página con la elección). */}
              <form method="get" action={`/admin/alumnos/${studentId}#planes`} className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
                  Profe
                  <select name="profe" required defaultValue={pickedTeacher ?? ""} className={select}>
                    <option value="" disabled>
                      Elegí…
                    </option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
                  Categoría
                  <select name="cat" required defaultValue={pickedCategory ?? ""} className={select}>
                    <option value="" disabled>
                      Elegí…
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <SmallSubmit>Ver horarios</SmallSubmit>
              </form>

              {/* Paso 2: los 2 horarios. */}
              {picked && picked.length === 0 && <p className="text-[15px] text-muted">Ese profe no tiene horarios para esa categoría.</p>}
              {picked && picked.length > 0 && (
                <form action={enrollStudent} className="flex flex-col gap-3">
                  <input type="hidden" name="student_id" value={studentId} />
                  <input type="hidden" name="teacher_id" value={pickedTeacher} />
                  <input type="hidden" name="age_category_id" value={pickedCategory} />
                  <fieldset className="flex flex-col gap-2">
                    <legend className="pb-1 text-sm font-semibold">Elegí 2 horarios</legend>
                    {picked.map((o) => (
                      <label
                        key={o.scheduleId}
                        className={`flex items-center gap-3 rounded-xl border border-line bg-white p-3 ${o.left === 0 ? "opacity-60" : ""}`}
                      >
                        <input type="checkbox" name="schedule_id" value={o.scheduleId} disabled={o.left === 0} className="size-5 accent-ink" />
                        <span className="flex flex-col">
                          <span className="text-[15px]">{o.label}</span>
                          <span className="text-sm text-muted">
                            {o.left === 0 ? "Completo" : `${o.left} de ${o.capacity} lugares libres`}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <div>
                    <SmallSubmit tone="dark">Inscribir</SmallSubmit>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
