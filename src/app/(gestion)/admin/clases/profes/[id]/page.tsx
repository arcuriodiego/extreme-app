import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckboxField, FormAlert, SelectField, SmallSubmit, SubmitButton, TextField } from "@/components/forms/fields";
import { ImagePicker } from "@/components/images/ImagePicker";
import { TeacherAvatar } from "@/components/images/TeacherAvatar";
import { NoAccess } from "@/components/status/NoAccess";
import { can } from "@/domain/auth/roles";
import { WEEKDAYS, weekdayLabel } from "@/domain/classes/schedule";
import { loadCatalog, loadGroups } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import {
  addSchedule,
  createTeacherClass,
  removeSchedule,
  removeTeacherPhoto,
  renameTeacher,
  setTeacherPayPeriod,
  setTeacherPhoto,
} from "../../actions";
import { ERRORS, NOTICES, STATUS_LABELS } from "../../messages";

export const metadata: Metadata = { title: "Profe" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const input = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

/** Perfil de un profe: sus datos y sus clases (agregar clase, agregar o quitar horarios). */
export default async function ProfePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const [profile, { id }, query] = await Promise.all([requireProfile(), params, searchParams]);
  if (!can(profile.access, "classes.manage")) return <NoAccess />;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [catalog, groups] = await Promise.all([loadCatalog(supabase), loadGroups(supabase)]);
  const teacher = catalog.teachers.find((t) => t.id === id);
  if (!teacher) notFound();
  const back = `/admin/clases/profes/${id}`;
  const mine = groups.filter((g) => g.teacherId === id && g.status !== "closed");
  const rooms = catalog.rooms.filter((r) => r.active);
  const active = <T extends { active: boolean; name: string; id: string }>(items: T[]) => items.filter((i) => i.active).map((i) => ({ value: i.id, label: i.name }));
  const notice = query.aviso ? NOTICES[query.aviso] : undefined;
  const failure = query.error ? (ERRORS[query.error] ?? ERRORS.generico) : undefined;

  return (
    <>
      <Link href="/admin/clases/profes" className="self-start text-sm font-semibold">
        ‹ Profes
      </Link>
      <div className="flex items-center gap-4">
        <TeacherAvatar name={teacher.displayName} url={teacher.photoUrl} size={72} />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">{teacher.displayName}</h1>
          <span className="text-[15px] text-muted">
            {mine.length === 0 ? "Sin clases asignadas" : `${mine.length} ${mine.length === 1 ? "clase" : "clases"}`} ·{" "}
            {teacher.payPeriod === "fortnight" ? "cobra por quincena" : "cobra el mes completo"}
          </span>
        </div>
      </div>
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Sus clases</h2>
        {mine.length === 0 && <p className="text-[15px] text-muted">Todavía no tiene clases. Agregale la primera acá abajo.</p>}
        <ul className="grid gap-3 lg:grid-cols-2">
          {mine.map((g) => (
            <li key={g.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-sm text-muted">
                    Cupo {g.capacity} · {g.allowsSingleBooking ? "acepta sueltas y packs" : "sólo cuota de profe"}
                  </span>
                </span>
                {g.status !== "active" && <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold">{STATUS_LABELS[g.status].toUpperCase()}</span>}
              </div>
              <ul className="flex flex-col">
                {g.schedules.length === 0 && <li className="text-sm text-muted">Sin horarios.</li>}
                {g.schedules.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 border-t border-line py-2 text-[15px]">
                    <span>
                      <strong>{weekdayLabel(s.weekday)}</strong> {s.start} a {s.end} · {s.roomName}
                    </span>
                    <form action={removeSchedule}>
                      <input type="hidden" name="group_id" value={g.id} />
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="back" value={back} />
                      <SmallSubmit tone="danger">Quitar</SmallSubmit>
                    </form>
                  </li>
                ))}
              </ul>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Agregar otro horario</summary>
                <form action={addSchedule} className="flex flex-wrap items-end gap-2 pt-2">
                  <input type="hidden" name="group_id" value={g.id} />
                  <input type="hidden" name="back" value={back} />
                  <select name="weekday" required defaultValue="" aria-label="Día" className={input}>
                    <option value="" disabled>
                      Día
                    </option>
                    {WEEKDAYS.map((d) => (
                      <option key={d.n} value={d.n}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <input type="time" name="start" required aria-label="Desde" className={input} />
                  <input type="time" name="end" required aria-label="Hasta" className={input} />
                  <select name="room_id" required defaultValue="" aria-label="Sala" className={input}>
                    <option value="" disabled>
                      Sala
                    </option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <SmallSubmit tone="dark">Agregar</SmallSubmit>
                </form>
              </details>
              <Link href={`/admin/clases/${g.id}`} className="self-start text-sm font-semibold">
                Editar o eliminar la clase
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex max-w-2xl flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-4">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">Agregar una clase</h2>
        <form action={createTeacherClass} className="flex flex-col gap-4">
          <input type="hidden" name="teacher_id" value={teacher.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="style_id" label="Estilo" required placeholder="Elegí…" options={active(catalog.styles)} />
            <SelectField name="age_category_id" label="Categoría de edad" required placeholder="Elegí…" options={active(catalog.ageCategories)} />
            <SelectField name="level_id" label="Nivel" placeholder="Sin nivel" options={active(catalog.levels)} />
            <TextField name="capacity" label="Cupo" inputMode="numeric" required defaultValue="20" hint="Lugares por clase." />
            <SelectField name="weekday" label="Día" required placeholder="Elegí…" options={WEEKDAYS.map((d) => ({ value: String(d.n), label: d.label }))} />
            <SelectField name="room_id" label="Sala" required placeholder="Elegí…" options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
            <TextField name="start" label="Desde" type="time" required />
            <TextField name="end" label="Hasta" type="time" required />
          </div>
          <CheckboxField name="allows_single_booking" label="Acepta clases sueltas y packs" hint="Si no está marcado, es sólo para alumnos con cuota de profe." defaultChecked />
          <div className="sm:max-w-xs">
            <SubmitButton pendingText="Creando…">Crear la clase</SubmitButton>
          </div>
          <p className="text-sm text-muted">Si da el mismo estilo y categoría otro día, agregale un horario a esa clase (arriba) en vez de crear otra.</p>
        </form>
      </section>

      <section className="flex max-w-2xl flex-col gap-4 border-t border-line pt-6">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">Datos del profe</h2>
        <form action={renameTeacher} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={teacher.id} />
          <input type="hidden" name="back" value={back} />
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
            Nombre que ven los alumnos
            <input name="display_name" defaultValue={teacher.displayName} maxLength={60} required className={input} />
          </label>
          <SmallSubmit>Guardar</SmallSubmit>
        </form>
        <form action={setTeacherPayPeriod} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={teacher.id} />
          <input type="hidden" name="back" value={back} />
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Cobra
            <select name="pay_period" defaultValue={teacher.payPeriod} className={input}>
              <option value="month">Mes completo</option>
              <option value="fortnight">Por quincena</option>
            </select>
          </label>
          <SmallSubmit>Guardar</SmallSubmit>
        </form>
        <form action={setTeacherPhoto} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={teacher.id} />
          <input type="hidden" name="back" value={back} />
          <ImagePicker kind="profes" current={teacher.photoUrl} label={teacher.photoUrl ? "Cambiar la foto" : "Agregar foto"} submitLabel="Subir foto" />
        </form>
        {teacher.photoUrl && (
          <form action={removeTeacherPhoto}>
            <input type="hidden" name="id" value={teacher.id} />
            <input type="hidden" name="back" value={back} />
            <SmallSubmit tone="danger">Quitar la foto</SmallSubmit>
          </form>
        )}
      </section>
    </>
  );
}
