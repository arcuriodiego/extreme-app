import type { Metadata } from "next";
import { WeeklyGrid } from "@/components/classes/WeeklyGrid";
import { FormAlert } from "@/components/forms/fields";
import { PageHeader } from "@/components/ui/basics";
import { loadGroups, slotsOf } from "@/lib/grilla";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clases" };

export default async function ClasesPage() {
  const supabase = await createClient();
  let slots: ReturnType<typeof slotsOf> = [];
  let failed = false;
  try {
    slots = slotsOf(await loadGroups(supabase, { onlyActive: true }));
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader title="Clases" subtitle="La grilla semanal de la academia." />
      {failed && <FormAlert kind="error">No pudimos cargar la grilla. Recargá la página.</FormAlert>}
      {!failed && slots.length === 0 && (
        <section className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface p-5">
          <span className="font-display text-xl font-bold uppercase tracking-wide">Grilla en preparación</span>
          <p className="text-[15px] leading-snug text-muted">Muy pronto vas a ver acá los días y horarios de cada clase.</p>
        </section>
      )}
      {slots.length > 0 && (
        <>
          <p className="rounded-xl bg-surface px-4 py-3 text-[15px] leading-snug">
            Muy pronto vas a poder <strong>reservar</strong> desde acá. Por ahora, consultá en recepción.
          </p>
          <WeeklyGrid slots={slots} />
        </>
      )}
    </>
  );
}
