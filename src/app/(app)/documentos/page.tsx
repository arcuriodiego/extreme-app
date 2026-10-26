import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/basics";
import { loadDocuments, sizeLabel } from "@/lib/documents";
import { loadCurrentRegulation } from "@/lib/regulations";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentosPage() {
  await requireProfile();
  const supabase = await createClient();
  const [regulation, documents] = await Promise.all([loadCurrentRegulation(supabase), loadDocuments(supabase).catch(() => [])]);
  const shown = documents.filter((d) => d.audience === "all");

  return (
    <>
      <Link href="/perfil" className="self-start text-sm font-semibold">
        ‹ Perfil
      </Link>
      <PageHeader title="Documentos" subtitle="Reglamento y archivos de la academia." />
      <ul className="flex flex-col">
        {regulation && (
          <li className="border-t border-line">
            <Link href="/reglamento" className="flex items-center justify-between gap-3 py-3.5 text-ink no-underline">
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{regulation.title}</span>
                <span className="text-sm text-muted">Versión {regulation.version}</span>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        )}
        {shown.map((d) => (
          <li key={d.id} className="border-t border-line">
            <a href={d.url ?? "#"} target="_blank" rel="noopener" className="flex items-center justify-between gap-3 py-3.5 text-ink no-underline">
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{d.title}</span>
                <span className="text-sm text-muted">
                  {d.mimeType === "application/pdf" ? "PDF" : "Imagen"} · {sizeLabel(d.sizeBytes)}
                  {d.description ? ` · ${d.description}` : ""}
                </span>
              </span>
              <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
      {!regulation && shown.length === 0 && <p className="text-[15px] text-muted">Todavía no hay documentos.</p>}
    </>
  );
}
