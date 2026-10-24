import type { Metadata } from "next";
import { FormAlert } from "@/components/forms/fields";
import { AnnouncementComposer } from "@/components/notices/AnnouncementComposer";
import { SEND_ERRORS, sentNotice } from "@/components/notices/messages";
import { SentList } from "@/components/notices/SentList";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { loadGroups } from "@/lib/grilla";
import { loadAnnouncements } from "@/lib/notifications";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Avisos" };

export default async function ProfeAvisosPage({ searchParams }: { searchParams: Promise<{ aviso?: string; n?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;
  const supabase = await createClient();
  const [groups, sent] = await Promise.all([loadGroups(supabase, { onlyActive: true }), loadAnnouncements(supabase)]);
  const mine = groups.filter((g) => g.teacherProfileId === profile.id);

  return (
    <>
      <PageHeader title="Avisos" subtitle="Mandales un aviso a los alumnos de tus grupos (y a sus tutores)." />
      {params.aviso === "enviado" && <FormAlert kind="ok">{sentNotice(params.n)}</FormAlert>}
      {params.error && SEND_ERRORS[params.error] && <FormAlert kind="error">{SEND_ERRORS[params.error]}</FormAlert>}
      {mine.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">Todavía no tenés grupos asignados.</p>
      ) : (
        <AnnouncementComposer targets={mine.map((g) => ({ value: g.id, label: g.name }))} back="/profe/avisos" />
      )}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">Tus avisos enviados</h2>
        <SentList rows={sent} showAuthor={false} />
      </section>
    </>
  );
}
