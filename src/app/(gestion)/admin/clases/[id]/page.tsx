import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert, SelectField, SmallSubmit, TextField } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { WEEKDAYS, weekdayLabel } from "@/domain/classes/schedule";
import { loadCatalog, loadGroup } from "@/lib/grilla";
import { loadFixedStudents } from "@/lib/memberships";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { addSchedule, removeSchedule, updateGroup } from "../actions";
import { GroupForm } from "../GroupForm";
import { ERRORS, NOTICES } from "../messages";

export const metadata: Metadata = { title: "Editar grupo" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GrupoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const [profile, { id }, query] = await Promise.all([requireProfile(), params, searchParams]);
  if (!can(profile.access, "classes.manage")) return <NoAccess />;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [group, catalog] = await Promise.all([loadGroup(supabase, id), loadCatalog(supabase)]);
  if (!group) notFound();
  const fixedStudents = await loadFixedStudents(supabase, group.schedules.map((s) => s.id));

  const notice = query.aviso ? NOTICES[query.aviso] : undefined;
  const failure = query.error ? ERRORS[query.error] : undefined;
  const rooms = catalog.rooms.filter((r) => r.active);

  return (
    <>
      <Link href="/admin/clases" className="self-start text-sm font-semibold">
        ‹ Clases y grilla
      </Link>
      <PageHeader title={group.name} subtitle={group.teacherName ? `Prof. ${group.teacherName}` : "Profe a confirmar"} />
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Días y horarios</h2>
        {group.schedules.length === 0 ? (
          <p className="text-[15px] text-muted">Todavía no tiene horarios.</p>
        ) : (
          <ul className="flex max-w-xl flex-col">
            {group.schedules.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 border-t border-line py-3">
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <strong>{weekdayLabel(s.weekday)}</strong> {s.start} a {s.end} · {s.roomName}
                  </span>
                  <form action={removeSchedule}>
                    <input type="hidden" name="group_id" value={group.id} />
                    <input type="hidden" name="id" value={s.id} />
                    <SmallSubmit tone="danger">Quitar</SmallSubmit>
                  </form>
                </div>
                {(() => {
                  const here = fixedStudents.filter((f) => f.scheduleId === s.id);
                  return (
                    <p className="text-sm text-muted">
                      {here.length === 0 ? "Sin alumnos fijos." : `Fijos (${here.length} de ${group.capacity}): `}
                      {here.map((f, i) => (
                        <span key={f.enrollmentId}>
                          {i > 0 && ", "}
                          <Link href={`/admin/alumnos/${f.studentId}#planes`}>{f.name}</Link>
                        </span>
                      ))}
                    </p>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}

        {rooms.length === 0 ? (
          <p className="rounded-xl bg-warn-soft px-4 py-3 text-[15px] text-warn-ink">
            Para agregar horarios primero cargá las salas en <Link href="/admin/clases/catalogo">Catálogo y salas</Link>.
          </p>
        ) : (
          <form action={addSchedule} className="flex max-w-xl flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-4">
            <input type="hidden" name="group_id" value={group.id} />
            <span className="font-semibold">Agregar horario</span>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField name="weekday" label="Día" required placeholder="Elegí…" options={WEEKDAYS.map((d) => ({ value: String(d.n), label: d.label }))} />
              <SelectField name="room_id" label="Sala" required placeholder="Elegí…" options={rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.capacity} personas)` }))} />
              <TextField name="start" label="Desde" type="time" required />
              <TextField name="end" label="Hasta" type="time" required />
            </div>
            <div>
              <SmallSubmit tone="dark">Agregar horario</SmallSubmit>
            </div>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Datos del grupo</h2>
        <GroupForm catalog={catalog} group={group} action={updateGroup} />
      </section>
    </>
  );
}
