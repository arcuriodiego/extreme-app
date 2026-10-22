import type { Metadata } from "next";
import { WeeklyGrid } from "@/components/classes/WeeklyGrid";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { loadGroups, slotsOf } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis clases" };

export default async function ProfeClasesPage() {
  const profile = await requireProfile();
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;

  const supabase = await createClient();
  const groups = await loadGroups(supabase, { onlyActive: true });
  const mine = groups.filter((g) => g.teacherProfileId === profile.id);
  const slots = slotsOf(mine);

  return (
    <>
      <PageHeader title="Mis clases" subtitle="Tus horarios de cada semana." />
      {slots.length === 0 ? (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface p-5">
          <span className="font-display text-xl font-bold uppercase tracking-wide">Sin clases asignadas</span>
          <p className="text-[15px] leading-snug text-muted">
            Cuando administración te asigne grupos, vas a ver acá tus días y horarios.
          </p>
        </section>
      ) : (
        <WeeklyGrid slots={slots} showCapacity />
      )}
    </>
  );
}
