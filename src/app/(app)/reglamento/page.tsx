import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { PageHeader } from "@/components/ui/basics";
import { academyConfig } from "@/config/academy";
import { safeNextPath } from "@/domain/auth/routes";
import { loadCurrentRegulation, myAcceptance } from "@/lib/regulations";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { acceptRegulation } from "./actions";

export const metadata: Metadata = { title: "Reglamento" };

const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: academyConfig.timeZone });
const ERRORS: Record<string, string> = {
  cambio: "El reglamento cambió mientras lo leías. Leé esta versión y aceptala.",
  generico: "No pudimos guardar la aceptación. Probá de nuevo.",
};

export default async function ReglamentoPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  const supabase = await createClient();
  const regulation = await loadCurrentRegulation(supabase);
  const acceptedAt = regulation ? await myAcceptance(supabase, regulation.id, profile.id) : null;
  const next = safeNextPath(params.next) ?? "/inicio";

  if (!regulation) {
    return (
      <>
        <PageHeader title="Reglamento" />
        <p className="text-[15px] text-muted">Todavía no hay un reglamento publicado.</p>
      </>
    );
  }

  return (
    <>
      <Link href="/perfil" className="self-start text-sm font-semibold">
        ‹ Perfil
      </Link>
      <PageHeader title={regulation.title} subtitle={`Versión ${regulation.version} · vigente desde el ${when.format(new Date(regulation.publishedAt))}`} />
      {params.error && <FormAlert kind="error">{ERRORS[params.error] ?? ERRORS.generico}</FormAlert>}
      <article className="whitespace-pre-line text-[15px] leading-relaxed">{regulation.body}</article>
      {acceptedAt ? (
        <p className="rounded-xl bg-ok-soft px-3 py-2 text-[15px] font-semibold text-ok-ink">
          Lo aceptaste el {when.format(new Date(acceptedAt))}.
        </p>
      ) : (
        <form action={acceptRegulation} className="sticky bottom-20 flex flex-col gap-2 rounded-[var(--radius-card)] border-[1.5px] border-ink bg-white p-4">
          <input type="hidden" name="id" value={regulation.id} />
          <input type="hidden" name="next" value={next} />
          <span className="text-[15px]">Al aceptar, confirmás que leíste el reglamento y estás de acuerdo (también en nombre de tus hijos a cargo).</span>
          <div>
            <SmallSubmit tone="dark">Leí y acepto el reglamento</SmallSubmit>
          </div>
        </form>
      )}
    </>
  );
}
