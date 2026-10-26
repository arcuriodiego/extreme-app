import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { academyConfig } from "@/config/academy";
import { can } from "@/domain/auth/roles";
import { canOpen } from "@/domain/navigation/menus";
import { loadDocuments, sizeLabel } from "@/lib/documents";
import { loadRegulationHistory } from "@/lib/regulations";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { publishRegulation, removeDocument, uploadDocument } from "./actions";

export const metadata: Metadata = { title: "Reglamento y documentos" };

const NOTICES: Record<string, string> = {
  "reglamento-publicado": "Listo, publicamos la versión nueva. A partir de ahora la app les pide a todos que la acepten.",
  "documento-subido": "Listo, subimos el documento.",
  "documento-quitado": "Listo, quitamos el documento.",
};
const ERRORS: Record<string, string> = {
  "reglamento-titulo": "Escribí el título del reglamento (hasta 120 letras).",
  "reglamento-texto": "Escribí el texto del reglamento (hasta 30.000 letras).",
  "documento-titulo": "Escribí el nombre del documento (hasta 120 letras).",
  "archivo-vacio": "Elegí el archivo.",
  "archivo-tipo": "El archivo tiene que ser PDF, JPG, PNG o WEBP.",
  "archivo-pesado": "El archivo pesa más de 4 MB. Probá exportarlo más liviano o subilo como imagen.",
  "archivo-subida": "No pudimos subir el archivo. Probá de nuevo.",
  "sin-permiso": "No tenés permiso para hacer esto.",
  datos: "Revisá los datos.",
  generico: "No pudimos guardar el cambio. Probá de nuevo.",
};

const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: academyConfig.timeZone });
const input = "w-full rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

export default async function DocumentosAdminPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "documentos")) return <NoAccess />;
  const canRegulate = can(profile.access, "settings.manage");
  const canDocs = can(profile.access, "people.manage");
  const supabase = await createClient();
  const [history, documents] = await Promise.all([loadRegulationHistory(supabase), loadDocuments(supabase)]);
  const current = history[0] ?? null;
  const notice = params.aviso ? NOTICES[params.aviso] : undefined;
  const failure = params.error ? ERRORS[params.error] : undefined;

  return (
    <>
      <PageHeader title="Reglamento y documentos" subtitle="Lo que los alumnos y sus familias leen en la app." />
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <section className="flex max-w-3xl flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Reglamento</h2>
        {current ? (
          <p className="text-[15px] text-muted">
            Vigente: <strong className="text-ink">versión {current.version}</strong>, publicada el {when.format(new Date(current.publishedAt))}.{" "}
            {current.accepted === 1 ? "La aceptó 1 cuenta." : `La aceptaron ${current.accepted} cuentas.`}
          </p>
        ) : (
          <p className="text-[15px] text-muted">Todavía no hay reglamento. Mientras no haya uno, la inscripción no lo pide.</p>
        )}
        {canRegulate ? (
          <form action={publishRegulation} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-[#3d3d3d]">Título</span>
              <input name="title" required maxLength={120} defaultValue={current?.title ?? "Reglamento de Extreme Dance Academy"} className={`h-12 ${input}`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-[#3d3d3d]">Texto</span>
              <textarea name="body" required maxLength={30000} rows={16} defaultValue={current?.body ?? ""} className={`py-3 leading-relaxed ${input}`} />
              <span className="text-sm text-muted">Separá los puntos con una línea en blanco. Se muestra tal cual en el celular.</span>
            </label>
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink">
              Publicar crea una versión nueva: todos los alumnos y tutores tienen que volver a aceptarla. Para un error de tipeo también se publica una versión
              nueva.
            </p>
            <div>
              <SmallSubmit tone="dark">{current ? "Publicar versión nueva" : "Publicar reglamento"}</SmallSubmit>
            </div>
          </form>
        ) : (
          current && (
            <Link href="/reglamento" className="self-start text-sm font-semibold">
              Ver el reglamento
            </Link>
          )
        )}
        {history.length > 1 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Versiones anteriores</summary>
            <ul className="flex flex-col gap-1 pt-2 text-sm text-muted">
              {history.slice(1).map((r) => (
                <li key={r.id}>
                  Versión {r.version} · {when.format(new Date(r.publishedAt))} · {r.accepted} {r.accepted === 1 ? "aceptación" : "aceptaciones"}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="flex max-w-3xl flex-col gap-3 border-t border-line pt-6">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Documentos</h2>
        <p className="text-[15px] text-muted">Horarios, calendario de feriados, protocolos… Los de &quot;Todos&quot; los ven alumnos y tutores en Perfil → Documentos.</p>
        {documents.length === 0 ? (
          <p className="text-[15px] text-muted">Todavía no hay documentos.</p>
        ) : (
          <ul className="flex flex-col">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener" className="font-semibold">
                      {d.title}
                    </a>
                  ) : (
                    <span className="font-semibold">{d.title}</span>
                  )}
                  <span className="text-sm text-muted">
                    {d.mimeType === "application/pdf" ? "PDF" : "Imagen"} · {sizeLabel(d.sizeBytes)} · {when.format(new Date(d.createdAt))}
                    {d.audience === "staff" ? " · SÓLO PERSONAL" : " · TODOS"}
                  </span>
                  {d.description && <span className="text-sm">{d.description}</span>}
                </span>
                {canDocs && (
                  <form action={removeDocument}>
                    <input type="hidden" name="id" value={d.id} />
                    <SmallSubmit tone="danger">Quitar</SmallSubmit>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canDocs && (
          <form action={uploadDocument} className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
            <span className="font-semibold">Subir un documento</span>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-[#3d3d3d]">Nombre</span>
              <input name="title" required maxLength={120} placeholder="Ej.: Horarios 2027" className={`h-12 ${input}`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-[#3d3d3d]">
                Descripción <span className="font-normal text-muted">(opcional)</span>
              </span>
              <input name="description" maxLength={300} className={`h-12 ${input}`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-[#3d3d3d]">¿Quién lo ve?</span>
              <select name="audience" defaultValue="all" className={`h-12 ${input}`}>
                <option value="all">Todos (alumnos, tutores y personal)</option>
                <option value="staff">Sólo el personal</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-[#3d3d3d]">Archivo</span>
              <input
                type="file"
                name="file"
                required
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-full file:border file:border-[#cfcfcf] file:bg-white file:px-3.5 file:text-sm file:font-semibold"
              />
              <span className="text-sm text-muted">PDF, JPG, PNG o WEBP, hasta 4 MB.</span>
            </label>
            <div>
              <SmallSubmit tone="dark">Subir documento</SmallSubmit>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
