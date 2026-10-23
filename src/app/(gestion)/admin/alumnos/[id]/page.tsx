import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { canOpen } from "@/domain/navigation/menus";
import { ageOn, STUDENT_STATUS_LABELS } from "@/domain/people/student";
import { academyToday } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { loadStudent, loadStudentNotes } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";
import { saveNotes, updateStudent, voidPayment } from "../actions";
import { methodLabel } from "@/domain/billing/payments";
import { formatARS } from "@/domain/shared/money";
import { ensureCharges, loadCharges, loadGraceDays, loadPayments } from "@/lib/billing";
import { loadPlans } from "@/lib/prices";
import { ERRORS, NOTICES } from "../messages";
import { StudentForm } from "../StudentForm";
import { MembershipSection } from "./MembershipSection";

export const metadata: Metadata = { title: "Ficha del alumno" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const longDate = (d: string) => dateFormat.format(new Date(`${d}T12:00:00Z`));

export default async function AlumnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string; profe?: string; cat?: string }>;
}) {
  const [profile, { id }, query] = await Promise.all([requireProfile(), params, searchParams]);
  if (!canOpen(profile.access, "alumnos")) return <NoAccess />;
  if (!UUID.test(id)) notFound();
  const canManage = can(profile.access, "people.manage");

  const supabase = await createClient();
  const today = academyToday();
  const canPay = can(profile.access, "payments.register");
  const canVoid = can(profile.access, "finance.view");
  const seesMoney = canPay || canVoid;
  // La generación diaria de cuotas corre antes de leer los cargos (es instantánea si ya corrió hoy).
  const [, student, notes, graceDays, plans] = await Promise.all([
    ensureCharges(supabase),
    loadStudent(supabase, id),
    loadStudentNotes(supabase, id),
    loadGraceDays(supabase),
    loadPlans(supabase, today),
  ]);
  const [charges, payments] = await Promise.all([
    seesMoney ? loadCharges(supabase, id) : Promise.resolve([]),
    seesMoney ? loadPayments(supabase, id) : Promise.resolve([]),
  ]);
  if (!student) notFound();
  const monthlyPrice = plans.find((p) => p.kind === "teacher_monthly" && p.active)?.current?.amountCents ?? null;

  const notice = query.aviso ? NOTICES[query.aviso] : undefined;
  const failure = query.error ? ERRORS[query.error] : undefined;
  const facts = [
    student.birthDate ? `${ageOn(student.birthDate, today)} años` : null,
    student.dni ? `DNI ${student.dni}` : null,
    `Alumno desde el ${longDate(student.joinedAt)}`,
  ].filter(Boolean);

  return (
    <>
      <Link href="/admin/alumnos" className="self-start text-sm font-semibold">
        ‹ Alumnos
      </Link>
      <div className="flex flex-col gap-2">
        <PageHeader title={student.name} subtitle={facts.join(" · ")} />
        <span className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">{STUDENT_STATUS_LABELS[student.status].toUpperCase()}</span>
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">{student.hasAccount ? "CON CUENTA EN LA APP" : "SIN CUENTA"}</span>
        </span>
      </div>
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Contacto</h2>
        <p className="text-[15px]">
          {student.email ?? "Sin email (no tiene cuenta)"}
          {student.phone ? ` · ${student.phone}` : " · Sin teléfono"}
        </p>
        {student.hasAccount && (
          <p className="text-sm text-muted">Nombre, email y teléfono los actualiza la persona desde la app, en Mi perfil.</p>
        )}
      </section>

      <MembershipSection
        supabase={supabase}
        studentId={student.id}
        canManage={canManage}
        pickedTeacher={query.profe && UUID.test(query.profe) ? query.profe : undefined}
        pickedCategory={query.cat && UUID.test(query.cat) ? query.cat : undefined}
        canPay={canPay}
        charges={charges}
        today={today}
        graceDays={graceDays}
        monthlyPriceCents={monthlyPrice}
      />

      {seesMoney && (
        <section className="flex flex-col gap-3 border-t border-line pt-6">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Pagos</h2>
          {payments.length === 0 ? (
            <p className="text-[15px] text-muted">Todavía no tiene pagos registrados.</p>
          ) : (
            <ul className="flex max-w-2xl flex-col">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-1.5 border-t border-line py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                    <span className={p.status === "void" ? "text-muted line-through" : ""}>
                      {p.date.split("-").reverse().join("/")} {p.time} · {methodLabel(p.method)}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <strong className={p.status === "void" ? "text-muted line-through" : ""}>{formatARS(p.amountCents)}</strong>
                  </div>
                  <span className="text-sm text-muted">
                    {p.concepts.join(" · ")}
                    {p.registeredBy ? ` · Cargó: ${p.registeredBy}` : ""}
                  </span>
                  {p.status === "void" && (
                    <span className="text-sm font-semibold text-alert-ink">ANULADO · {p.voidReason}</span>
                  )}
                  {p.status === "approved" && canVoid && (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-alert-ink">Anular este pago</summary>
                      <form action={voidPayment} className="flex gap-2 pt-2">
                        <input type="hidden" name="student_id" value={student.id} />
                        <input type="hidden" name="payment_id" value={p.id} />
                        <label htmlFor={`anular-${p.id}`} className="sr-only">
                          Motivo
                        </label>
                        <input
                          id={`anular-${p.id}`}
                          name="reason"
                          required
                          maxLength={200}
                          placeholder="Motivo (obligatorio)"
                          className="h-10 min-w-0 flex-1 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink"
                        />
                        <SmallSubmit tone="danger">Anular</SmallSubmit>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canManage && (
        <>
          <section className="flex flex-col gap-3 border-t border-line pt-6">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Notas internas</h2>
            <p className="text-sm text-muted">Sólo las ve el personal. El alumno nunca las ve.</p>
            <form action={saveNotes} className="flex max-w-xl flex-col gap-3">
              <input type="hidden" name="id" value={student.id} />
              <label htmlFor="notas" className="sr-only">
                Notas internas
              </label>
              <textarea
                id="notas"
                name="notes"
                defaultValue={notes}
                maxLength={2000}
                rows={4}
                className="rounded-xl border border-[#cfcfcf] bg-white px-4 py-3 text-base outline-none focus:border-ink"
              />
              <div>
                <SmallSubmit tone="dark">Guardar notas</SmallSubmit>
              </div>
            </form>
          </section>

          <section className="flex flex-col gap-3 border-t border-line pt-6">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Datos de la ficha</h2>
            <StudentForm student={student} action={updateStudent} />
          </section>
        </>
      )}
    </>
  );
}
