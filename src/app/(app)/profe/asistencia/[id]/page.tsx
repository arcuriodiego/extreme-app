import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RosterList } from "@/components/access/RosterList";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { longDate } from "@/domain/classes/sessions";
import { loadRoster } from "@/lib/attendance";
import { loadSession } from "@/lib/sessions";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lista de la clase" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ListaProfePage({ params }: { params: Promise<{ id: string }> }) {
  const [profile, { id }] = await Promise.all([requireProfile(), params]);
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [session, rows] = await Promise.all([loadSession(supabase, id), loadRoster(supabase, id)]);
  if (!session) notFound();

  return (
    <>
      <Link href="/profe/asistencia" className="text-sm font-semibold">
        ← Asistencia
      </Link>
      <PageHeader title={session.title} subtitle={`${longDate(session.date)} · ${session.start} a ${session.end} · ${session.roomName}`} />
      <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">
        Los presentes los registra recepción cuando cada alumno llega. Si falta alguien que vino, avisá en recepción.
      </p>
      <RosterList rows={rows} sessionId={session.id} back={`/profe/asistencia/${session.id}`} canMark={false} />
    </>
  );
}
