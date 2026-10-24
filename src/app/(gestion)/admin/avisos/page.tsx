import type { Metadata } from "next";
import { FormAlert } from "@/components/forms/fields";
import { AnnouncementComposer } from "@/components/notices/AnnouncementComposer";
import { SEND_ERRORS, sentNotice } from "@/components/notices/messages";
import { SentList } from "@/components/notices/SentList";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { loadGroups } from "@/lib/grilla";
import { loadAnnouncements } from "@/lib/notifications";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Avisos" };

export default async function AvisosGestionPage({ searchParams }: { searchParams: Promise<{ aviso?: string; n?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "avisos")) return <NoAccess />;
  const supabase = await createClient();
  const [groups, sent] = await Promise.all([loadGroups(supabase, { onlyActive: true }), loadAnnouncements(supabase)]);
  const targets = [
    { value: "todos", label: "Todos los alumnos activos" },
    ...groups.map((g) => ({ value: g.id, label: `${g.name}${g.teacherName ? ` · Prof. ${g.teacherName}` : ""}` })),
  ];

  return (
    <>
      <PageHeader title="Avisos" subtitle="Mandá un aviso a todos los alumnos o a un grupo. Los avisos de cuotas y packs salen solos." />
      {params.aviso === "enviado" && <FormAlert kind="ok">{sentNotice(params.n)}</FormAlert>}
      {params.error && SEND_ERRORS[params.error] && <FormAlert kind="error">{SEND_ERRORS[params.error]}</FormAlert>}
      <div className="grid gap-10 xl:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Nuevo aviso</h2>
          <AnnouncementComposer targets={targets} back="/admin/avisos" />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Enviados</h2>
          <SentList rows={sent} showAuthor />
        </section>
      </div>
    </>
  );
}
