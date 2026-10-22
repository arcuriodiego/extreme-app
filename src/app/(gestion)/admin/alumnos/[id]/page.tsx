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
import { saveNotes, updateStudent } from "../actions";
import { ERRORS, NOTICES } from "../messages";
import { StudentForm } from "../StudentForm";

export const metadata: Metadata = { title: "Ficha del alumno" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const longDate = (d: string) => dateFormat.format(new Date(`${d}T12:00:00Z`));

export default async function AlumnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const [profile, { id }, query] = await Promise.all([requireProfile(), params, searchParams]);
  if (!canOpen(profile.access, "alumnos")) return <NoAccess />;
  if (!UUID.test(id)) notFound();
  const canManage = can(profile.access, "people.manage");

  const supabase = await createClient();
  const [student, notes] = await Promise.all([loadStudent(supabase, id), loadStudentNotes(supabase, id)]);
  if (!student) notFound();

  const today = academyToday();
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

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Planes</h2>
        <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">
          Próximamente: inscripción a la cuota de profe con sus horarios fijos, packs y estado de pagos.
        </p>
      </section>

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
