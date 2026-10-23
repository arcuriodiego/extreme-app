import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RosterList } from "@/components/access/RosterList";
import { FormAlert } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { longDate } from "@/domain/classes/sessions";
import { ATTENDANCE_ERRORS, loadRoster } from "@/lib/attendance";
import { loadSession } from "@/lib/sessions";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lista de la clase" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ListaProfePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [profile, { id }, sp] = await Promise.all([requireProfile(), params, searchParams]);
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [session, rows] = await Promise.all([loadSession(supabase, id), loadRoster(supabase, id)]);
  if (!session) notFound();
  const failure = sp.error ? ATTENDANCE_ERRORS[sp.error] : undefined;

  return (
    <>
      <Link href="/profe/asistencia" className="text-sm font-semibold">
        ← Asistencia
      </Link>
      <PageHeader title={session.title} subtitle={`${longDate(session.date)} · ${session.start} a ${session.end} · ${session.roomName}`} />
      {failure && <FormAlert kind="error">{failure}</FormAlert>}
      <Link
        href="/profe/asistencia/escaner"
        className="flex h-11 items-center justify-center rounded-full border border-ink font-bold text-ink no-underline hover:bg-surface hover:text-ink"
      >
        Escanear pases QR
      </Link>
      <RosterList rows={rows} sessionId={session.id} back={`/profe/asistencia/${session.id}`} canMark />
    </>
  );
}
