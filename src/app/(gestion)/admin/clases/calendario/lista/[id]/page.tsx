import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RosterList } from "@/components/access/RosterList";
import { FormAlert } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { longDate } from "@/domain/classes/sessions";
import { canOpen } from "@/domain/navigation/menus";
import { ATTENDANCE_ERRORS, loadRoster } from "@/lib/attendance";
import { loadSession } from "@/lib/sessions";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lista de la clase" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ListaGestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [profile, { id }, sp] = await Promise.all([requireProfile(), params, searchParams]);
  if (!canOpen(profile.access, "clases") || !can(profile.access, "people.view")) return <NoAccess />;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [session, rows] = await Promise.all([loadSession(supabase, id), loadRoster(supabase, id)]);
  if (!session) notFound();
  const failure = sp.error ? ATTENDANCE_ERRORS[sp.error] : undefined;
  const canMark = can(profile.access, "attendance.mark") && can(profile.access, "people.manage") && session.status === "scheduled";

  return (
    <>
      <Link href={`/admin/clases/calendario?dia=${session.date}`} className="text-sm font-semibold">
        ← Calendario
      </Link>
      <PageHeader
        title={session.title}
        subtitle={`${longDate(session.date)} · ${session.start} a ${session.end} · ${session.roomName}${session.teacherName ? ` · Prof. ${session.substituteName ?? session.teacherName}` : ""}`}
      />
      {failure && <FormAlert kind="error">{failure}</FormAlert>}
      <div className="max-w-2xl">
        <RosterList rows={rows} sessionId={session.id} back={`/admin/clases/calendario/lista/${session.id}`} canMark={canMark} />
      </div>
    </>
  );
}
