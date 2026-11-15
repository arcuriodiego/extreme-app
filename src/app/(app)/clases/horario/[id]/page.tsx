import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/basics";
import Link from "next/link";
import { requireProfile } from "@/lib/session";
import { ensureSessions } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Desde la grilla semanal: lleva a la próxima clase de ese horario. */
export default async function HorarioPage({ params }: { params: Promise<{ id: string }> }) {
  const [, { id }] = await Promise.all([requireProfile(), params]);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  await ensureSessions(supabase);
  const { data } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("schedule_id", id)
    .eq("status", "scheduled")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (data) redirect(`/clases/clase/${(data as { id: string }).id}`);
  return (
    <>
      <Link href="/clases" className="self-start text-sm font-semibold">
        ‹ Clases
      </Link>
      <PageHeader title="Sin fechas próximas" subtitle="Esta clase no tiene fechas en las próximas semanas. Mirá la grilla o consultá en recepción." />
    </>
  );
}
