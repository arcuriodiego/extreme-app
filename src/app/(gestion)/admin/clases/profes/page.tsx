import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/forms/fields";
import { TeacherAvatar } from "@/components/images/TeacherAvatar";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { weekdayLabel } from "@/domain/classes/schedule";
import { loadCatalog, loadGroups } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ERRORS, NOTICES } from "../messages";
import { SectionTabs } from "../SectionTabs";

export const metadata: Metadata = { title: "Profes" };

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Clases y grilla, ordenado por profe: cada uno con sus clases de la semana. */
export default async function ProfesPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!can(profile.access, "classes.manage")) return <NoAccess />;
  const supabase = await createClient();
  const [catalog, groups] = await Promise.all([loadCatalog(supabase), loadGroups(supabase)]);
  const live = groups.filter((g) => g.status !== "closed");
  const unassigned = live.filter((g) => !g.teacherId);
  const teachers = [...catalog.teachers].sort((a, b) => Number(b.active) - Number(a.active) || a.displayName.localeCompare(b.displayName, "es"));

  return (
    <>
      <PageHeader title="Clases y grilla" subtitle="Cada profe con sus clases. Entrá a un profe para ver, agregar o quitar sus clases." />
      <SectionTabs current="profes" canManage />
      {params.aviso && NOTICES[params.aviso] && <FormAlert kind="ok">{NOTICES[params.aviso]}</FormAlert>}
      {params.error && <FormAlert kind="error">{ERRORS[params.error] ?? ERRORS.generico}</FormAlert>}

      {teachers.length === 0 ? (
        <p className="text-[15px] text-muted">
          Todavía no hay profes. Para sumar uno: que cree su cuenta en la app y asignale el rol Profesor en{" "}
          <Link href="/admin/usuarios">Usuarios y roles</Link>.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teachers.map((t) => {
            const mine = live.filter((g) => g.teacherId === t.id);
            const slots = mine.filter((g) => g.status === "active").flatMap((g) => g.schedules);
            const hours = slots.reduce((sum, s) => sum + (minutes(s.end) - minutes(s.start)) / 60, 0);
            const days = [...new Set(slots.sort((a, b) => a.weekday - b.weekday).map((s) => weekdayLabel(s.weekday).slice(0, 3)))];
            return (
              <li key={t.id}>
                <Link
                  href={`/admin/clases/profes/${t.id}`}
                  className="flex h-full items-center gap-3 rounded-[var(--radius-card)] border border-line p-4 text-ink no-underline hover:border-ink hover:text-ink"
                >
                  <TeacherAvatar name={t.displayName} url={t.photoUrl} size={56} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold">
                      {t.displayName}
                      {!t.active && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs font-bold">SIN ROL</span>}
                    </span>
                    <span className="text-sm text-muted">
                      {slots.length === 0
                        ? "Sin clases asignadas"
                        : `${slots.length} ${slots.length === 1 ? "clase" : "clases"} por semana · ${Number.isInteger(hours) ? hours : hours.toFixed(1).replace(".", ",")} h`}
                    </span>
                    {days.length > 0 && <span className="text-sm text-muted">{days.join(" · ")}</span>}
                    <span className="text-xs text-muted">{t.payPeriod === "fortnight" ? "Cobra por quincena" : "Cobra el mes completo"}</span>
                  </span>
                  <span aria-hidden="true" className="ml-auto">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {unassigned.length > 0 && (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-warn-soft p-4 text-warn-ink">
          <span className="font-semibold">Clases sin profe ({unassigned.length})</span>
          <ul className="flex flex-col gap-1 text-[15px]">
            {unassigned.map((g) => (
              <li key={g.id}>
                <Link href={`/admin/clases/${g.id}`} className="text-warn-ink">
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted">
        Para sumar un profe: que cree su cuenta en la app y asignale el rol Profesor en <Link href="/admin/usuarios">Usuarios y roles</Link>. Aparece acá
        solo.
      </p>
    </>
  );
}
