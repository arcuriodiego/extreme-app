import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { canOpen } from "@/domain/navigation/menus";
import { ageOn, STUDENT_STATUS_LABELS } from "@/domain/people/student";
import { academyToday, loadGroups } from "@/lib/grilla";
import { loadPendingSignup, signupSlots, slotLabel } from "@/lib/signups";
import { acceptancesOf, loadCurrentRegulation } from "@/lib/regulations";
import { requireProfile } from "@/lib/session";
import { loadStudent, loadStudentNotes } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";
import { deleteStudent, openReceipt, removeFichaPhoto, saveNotes, setFichaPhoto, updateStudent, voidPayment } from "../actions";
import { ImagePicker } from "@/components/images/ImagePicker";
import { TeacherAvatar } from "@/components/images/TeacherAvatar";
import { studentPhotoUrl } from "@/lib/images";
import { loadFamilyOpenCharges } from "@/lib/receipts";
import { PayTogetherSection } from "./PayTogetherSection";
import { methodLabel } from "@/domain/billing/payments";
import { formatARS } from "@/domain/shared/money";
import { ensureCharges, loadCharges, loadGraceDays, loadPayments, loadSurcharge } from "@/lib/billing";
import { loadPlans } from "@/lib/prices";
import { ERRORS, NOTICES } from "../messages";
import { StudentForm } from "../StudentForm";
import { MembershipSection } from "./MembershipSection";
import { PacksSection } from "./PacksSection";
import { GuardiansSection } from "./GuardiansSection";
import { loadGuardians, loadWards } from "@/lib/guardians";

export const metadata: Metadata = { title: "Ficha del alumno" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const longDate = (d: string) => dateFormat.format(new Date(`${d}T12:00:00Z`));

/** El profe y la categoría elegidos llegan juntos ("combo") o por separado (al volver de un error). */
function pickTeacher(q: { profe?: string; combo?: string }): string | undefined {
  const v = q.combo?.split(":")[0] ?? q.profe;
  return v && UUID.test(v) ? v : undefined;
}
function pickCategory(q: { cat?: string; combo?: string }): string | undefined {
  const v = q.combo?.split(":")[1] ?? q.cat;
  return v && UUID.test(v) ? v : undefined;
}

export default async function AlumnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string; profe?: string; cat?: string; combo?: string }>;
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
  const [, student, notes, graceDays, plans, surcharge] = await Promise.all([
    ensureCharges(supabase),
    loadStudent(supabase, id),
    loadStudentNotes(supabase, id),
    loadGraceDays(supabase),
    loadPlans(supabase, today),
    loadSurcharge(supabase),
  ]);
  const [charges, payments, familyCharges] = await Promise.all([
    seesMoney ? loadCharges(supabase, id) : Promise.resolve([]),
    seesMoney ? loadPayments(supabase, id) : Promise.resolve([]),
    canPay ? loadFamilyOpenCharges(supabase, id).catch(() => []) : Promise.resolve([]),
  ]);
  if (!student) notFound();
  const [guardians, wards, signup] = await Promise.all([
    loadGuardians(supabase, student.id),
    student.profileId ? loadWards(supabase, student.profileId) : Promise.resolve([]),
    loadPendingSignup(supabase, student.id).catch(() => null),
  ]);
  const [currentRegulation, acceptances] = await Promise.all([
    loadCurrentRegulation(supabase),
    acceptancesOf(supabase, [student.profileId, ...guardians.map((g) => g.profileId)].filter((x): x is string => !!x)),
  ]);
  const accepters = [
    ...(student.profileId ? [{ name: "El alumno", profileId: student.profileId }] : []),
    ...guardians.filter((g) => g.profileId).map((g) => ({ name: g.name, profileId: g.profileId! })),
  ];
  const signupSlotsList = signup ? signupSlots(await loadGroups(supabase).catch(() => [])) : [];
  const monthlyEntry = plans.find((p) => p.kind === "teacher_monthly" && p.active)?.current ?? null;
  const monthlyPrice = monthlyEntry?.amountCents ?? null;

  const photoUrl = await studentPhotoUrl(supabase, student.photoPath).catch(() => null);
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
        <div className="flex items-center gap-4">
          <TeacherAvatar name={student.name} url={photoUrl} size={72} />
          <div className="min-w-0 flex-1">
            <PageHeader title={student.name} subtitle={facts.join(" · ")} />
          </div>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">{STUDENT_STATUS_LABELS[student.status].toUpperCase()}</span>
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">{student.hasAccount ? "CON CUENTA EN LA APP" : "SIN CUENTA"}</span>
        </span>
      </div>
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}
      {currentRegulation && accepters.length > 0 && (
        <p className="text-sm text-muted">
          Reglamento:{" "}
          {accepters
            .map((a) => {
              const acc = acceptances.get(a.profileId);
              if (!acc) return `${a.name}, sin aceptar`;
              const date = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(acc.acceptedAt));
              return `${a.name}, aceptó la versión ${acc.version}${acc.version < currentRegulation.version ? " (hay una nueva)" : ""} el ${date}`;
            })
            .join(" · ")}
        </p>
      )}
      {signup && (
        <div className="flex max-w-2xl flex-col gap-2 rounded-[var(--radius-card)] border-[1.5px] border-ink p-4">
          <span className="font-semibold">
            Se inscribió desde la app{signup.byGuardian ? ` (lo anotó ${signup.requestedBy.name})` : ""} y pidió:
          </span>
          <ul className="flex flex-col gap-1 text-[15px]">
            {signup.scheduleIds.map((sid) => (
              <li key={sid}>{slotLabel(signupSlotsList.find((s) => s.id === sid))}</li>
            ))}
          </ul>
          {signup.note && <p className="text-[15px] text-muted">“{signup.note}”</p>}
          <p className="text-sm text-muted">Al darle la cuota de profe (más abajo), la inscripción queda confirmada sola.</p>
        </div>
      )}

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

      <GuardiansSection
        studentId={student.id}
        guardians={guardians}
        wards={wards}
        canManage={canManage}
        isMinor={student.birthDate ? ageOn(student.birthDate, today) < 18 : false}
      />

      <MembershipSection
        supabase={supabase}
        studentId={student.id}
        canManage={canManage}
        pickedTeacher={pickTeacher(query)}
        pickedCategory={pickCategory(query)}
        canPay={canPay}
        charges={charges}
        today={today}
        graceDays={graceDays}
        monthlyPriceCents={monthlyPrice}
        monthlyOtherCents={monthlyEntry?.otherCents ?? null}
        surchargePct={surcharge}
      />

      <PacksSection supabase={supabase} studentId={student.id} canPay={canPay} canManage={canManage} plans={plans} today={today} surchargePct={surcharge} />

      {canPay && <PayTogetherSection studentId={student.id} charges={familyCharges} />}

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
                  {p.status === "approved" && canPay && (
                    <form action={openReceipt}>
                      <input type="hidden" name="student_id" value={student.id} />
                      <input type="hidden" name="payment_id" value={p.id} />
                      <SmallSubmit>{p.receiptId ? "Ver recibo / mandar por WhatsApp" : "Hacer recibo / mandar por WhatsApp"}</SmallSubmit>
                    </form>
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
                          className="h-10 min-w-0 flex-1 rounded-xl border border-edge bg-paper px-3 text-base outline-none focus:border-ink"
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
                className="rounded-xl border border-edge bg-paper px-4 py-3 text-base outline-none focus:border-ink"
              />
              <div>
                <SmallSubmit tone="dark">Guardar notas</SmallSubmit>
              </div>
            </form>
          </section>

          <section className="flex flex-col gap-3 border-t border-line pt-6">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Foto para recepción</h2>
            <p className="text-sm text-muted">
              Para reconocer al alumno al entrar (aparece en el escáner). Es privada: sólo la ve el personal, el alumno y sus tutores. También la
              puede subir el alumno adulto o su tutor/a desde su perfil.
            </p>
            <form action={setFichaPhoto} className="flex max-w-xl flex-col gap-3">
              <input type="hidden" name="id" value={student.id} />
              <ImagePicker kind="alumnos" current={null} label={photoUrl ? "Cambiar la foto" : "Elegir o sacar una foto"} submitLabel="Subir foto" />
            </form>
            {photoUrl && (
              <form action={removeFichaPhoto}>
                <input type="hidden" name="id" value={student.id} />
                <SmallSubmit tone="danger">Quitar la foto</SmallSubmit>
              </form>
            )}
          </section>

          <section className="flex flex-col gap-3 border-t border-line pt-6">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Datos de la ficha</h2>
            <StudentForm student={student} action={updateStudent} />
          </section>
        </>
      )}

      {can(profile.access, "settings.manage") && (
        <section className="flex flex-col gap-3 border-t border-line pt-6">
          <details className="max-w-xl">
            <summary className="cursor-pointer font-semibold text-alert-ink">Eliminar esta ficha</summary>
            <form action={deleteStudent} className="flex flex-col gap-3 pt-3">
              <input type="hidden" name="id" value={student.id} />
              <p className="text-[15px] text-muted">
                Para fichas o cuentas creadas por error. Sólo se puede si no tiene historial (cuotas, pagos, reservas o ingresos); si lo
                tiene, pasala a Inactivo. Si tiene cuenta en la app y es sólo de alumno, también se borra la cuenta. No se puede deshacer.
              </p>
              <label className="flex items-center gap-3 text-[15px]">
                <input type="checkbox" name="confirm" value="1" required className="size-5 accent-ink" />
                Entiendo que se borra para siempre.
              </label>
              <div>
                <SmallSubmit tone="danger">Eliminar ficha</SmallSubmit>
              </div>
            </form>
          </details>
        </section>
      )}
    </>
  );
}
