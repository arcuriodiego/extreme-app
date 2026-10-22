import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { ButtonLink, PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { STUDENT_STATUS_LABELS } from "@/domain/people/student";
import { canOpen } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";
import { searchStudents } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Alumnos" };

const statusStyle = {
  trial: "bg-warn-soft text-warn-ink",
  active: "bg-ok-soft text-ok-ink",
  occasional: "bg-surface text-ink",
  inactive: "bg-surface text-muted",
} as const;

export default async function AlumnosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "alumnos")) return <NoAccess />;
  const canManage = can(profile.access, "people.manage");
  const q = (params.q ?? "").trim().slice(0, 80);

  const { rows, error } = await searchStudents(await createClient(), q);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Alumnos" subtitle="Fichas de la academia. Quien se registra en la app aparece solo." />
        {canManage && <ButtonLink href="/admin/alumnos/nuevo">Nuevo alumno</ButtonLink>}
      </div>
      {error && <FormAlert kind="error">No pudimos cargar la lista. Recargá la página.</FormAlert>}

      <form role="search" className="flex flex-wrap gap-2">
        <label htmlFor="buscar" className="sr-only">
          Buscar por nombre, apellido o DNI
        </label>
        <input
          id="buscar"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Buscar por nombre, apellido o DNI"
          className="h-12 min-w-0 flex-1 rounded-xl border border-[#cfcfcf] bg-white px-4 text-base outline-none focus:border-ink"
        />
        <button type="submit" className="h-12 rounded-xl bg-ink px-5 font-bold text-white">
          Buscar
        </button>
      </form>

      <p className="text-sm text-muted">
        {rows.length === 100 ? "Mostrando los primeros 100. Usá el buscador." : `${rows.length} ${rows.length === 1 ? "alumno" : "alumnos"}`}
      </p>

      <ul className="flex flex-col">
        {rows.map((s) => (
          <li key={s.id} className="border-t border-line">
            <Link href={`/admin/alumnos/${s.id}`} className="flex items-center justify-between gap-3 py-3.5 text-ink no-underline hover:text-ink">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{s.name}</span>
                <span className="truncate text-sm text-muted">
                  {[s.dni ? `DNI ${s.dni}` : null, s.email ?? "Sin cuenta en la app"].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusStyle[s.status]}`}>
                  {STUDENT_STATUS_LABELS[s.status].toUpperCase()}
                </span>
                <span aria-hidden="true">›</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
