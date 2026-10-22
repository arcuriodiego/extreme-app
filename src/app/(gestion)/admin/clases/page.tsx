import type { Metadata } from "next";
import Link from "next/link";
import { WeeklyGrid } from "@/components/classes/WeeklyGrid";
import { FormAlert } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { ButtonLink, PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { weekdayLabel } from "@/domain/classes/schedule";
import { canOpen } from "@/domain/navigation/menus";
import { loadGroups, slotsOf } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ERRORS, STATUS_LABELS } from "./messages";
import { SectionTabs } from "./SectionTabs";

export const metadata: Metadata = { title: "Clases y grilla" };

export default async function ClasesAdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "clases")) return <NoAccess />;
  const canManage = can(profile.access, "classes.manage");

  const supabase = await createClient();
  const groups = await loadGroups(supabase);
  const active = groups.filter((g) => g.status === "active");
  const slots = slotsOf(active);
  const failure = params.error ? ERRORS[params.error] : undefined;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Clases y grilla" subtitle={`${active.length} ${active.length === 1 ? "grupo activo" : "grupos activos"} · ${slots.length} ${slots.length === 1 ? "horario" : "horarios"} por semana`} />
        {canManage && <ButtonLink href="/admin/clases/nuevo">Nuevo grupo</ButtonLink>}
      </div>
      <SectionTabs current="grilla" canManage={canManage} />
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      {groups.length === 0 ? (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface p-5">
          <span className="font-display text-xl font-bold uppercase tracking-wide">Todavía no hay grupos</span>
          <p className="text-[15px] leading-snug text-muted">
            {canManage
              ? "Empezá creando un grupo (por ejemplo Hip Hop · Teens · Principiante) y después agregale sus días y horarios. Si todavía no cargaste las salas, hacelo primero en Catálogo y salas."
              : "Cuando administración cargue los grupos y horarios, vas a verlos acá."}
          </p>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Grupos</h2>
            <ul className="flex flex-col">
              {groups.map((g) => (
                <li key={g.id} className="flex flex-col gap-2 border-t border-line py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {g.name}
                      {g.status !== "active" && (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold uppercase">{STATUS_LABELS[g.status]}</span>
                      )}
                    </span>
                    <span className="text-sm text-muted">
                      {g.teacherName ? `Prof. ${g.teacherName}` : "Profe a confirmar"} · Cupo {g.capacity}
                    </span>
                    <span className="text-sm">
                      {g.schedules.length === 0
                        ? "Sin horarios"
                        : g.schedules.map((s) => `${weekdayLabel(s.weekday)} ${s.start}–${s.end} (${s.roomName})`).join(" · ")}
                    </span>
                  </div>
                  {canManage && (
                    <Link href={`/admin/clases/${g.id}`} className="shrink-0 font-semibold">
                      Editar
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {slots.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Semana</h2>
              <WeeklyGrid slots={slots} showCapacity wide hrefFor={canManage ? (s) => `/admin/clases/${s.groupId}` : undefined} />
            </section>
          )}
        </>
      )}
    </>
  );
}
