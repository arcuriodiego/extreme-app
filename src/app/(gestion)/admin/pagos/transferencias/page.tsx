import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { academyConfig } from "@/config/academy";
import { can } from "@/domain/auth/roles";
import { formatARS } from "@/domain/shared/money";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { confirmTransfer, rejectTransfer } from "./actions";

export const metadata: Metadata = { title: "Transferencias por confirmar" };

const NOTICES: Record<string, string> = {
  confirmada: "Listo: se registró el cobro y se activó lo que compró.",
  "a-revisar": "Se registró el cobro, pero no se pudo activar solo (por ejemplo, la clase se llenó). Quedó en \"a revisar\" en Pagos.",
  rechazada: "Listo, la rechazamos. El alumno ve el motivo en su app.",
};
const ERRORS: Record<string, string> = {
  datos: "Algo salió mal. Recargá la página.",
  motivo: "Escribí el motivo del rechazo.",
  "sin-permiso": "No tenés permiso para confirmar cobros.",
  generico: "No pudimos hacerlo. Recargá la página y probá de nuevo.",
};

const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: academyConfig.timeZone });

/** Transferencias que los alumnos avisaron desde la app, con su comprobante, para confirmar o rechazar. */
export default async function TransferenciasPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const [profile, q] = await Promise.all([requireProfile(), searchParams]);
  if (!can(profile.access, "payments.register")) return <NoAccess />;
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchases")
    .select("id, student_id, description, amount_cents, proof_path, created_at, student:students(first_name, last_name)")
    .eq("channel", "transfer")
    .eq("status", "pending")
    .order("created_at");
  const rows = (data ?? []) as unknown as {
    id: string;
    student_id: string;
    description: string;
    amount_cents: number;
    proof_path: string | null;
    created_at: string;
    student: { first_name: string; last_name: string } | null;
  }[];
  const paths = rows.map((r) => r.proof_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length > 0 ? await supabase.storage.from("comprobantes").createSignedUrls(paths, 3600) : { data: [] };
  const urls = new Map((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]));

  return (
    <>
      <Link href="/admin/pagos" className="self-start text-sm font-semibold">
        ‹ Pagos
      </Link>
      <PageHeader
        title="Transferencias por confirmar"
        subtitle="Las avisaron los alumnos desde la app. Fijate en la cuenta que haya entrado el monto y confirmá: se registra el cobro y se activa lo que compraron."
      />
      {q.aviso && NOTICES[q.aviso] && <FormAlert kind="ok">{NOTICES[q.aviso]}</FormAlert>}
      {q.error && <FormAlert kind="error">{ERRORS[q.error] ?? ERRORS.generico}</FormAlert>}
      {rows.length === 0 ? (
        <p className="rounded-xl bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-ink">No hay transferencias para confirmar.</p>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-3">
          {rows.map((r) => {
            const url = r.proof_path ? urls.get(r.proof_path) : undefined;
            const pdf = r.proof_path?.endsWith(".pdf");
            return (
              <li key={r.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex flex-col">
                    <Link href={`/admin/alumnos/${r.student_id}`} className="font-semibold">
                      {r.student ? `${r.student.first_name} ${r.student.last_name}` : "Alumno"}
                    </Link>
                    <span className="text-sm text-muted">
                      {r.description} · avisó el {when.format(new Date(r.created_at))}
                    </span>
                  </span>
                  <strong className="font-display text-2xl">{formatARS(Number(r.amount_cents))}</strong>
                </div>
                {url ? (
                  pdf ? (
                    <a href={url} target="_blank" rel="noreferrer" className="self-start text-sm font-semibold underline">
                      Ver comprobante (PDF)
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" className="self-start">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Comprobante" className="max-h-72 rounded-xl border border-line object-contain" />
                    </a>
                  )
                ) : (
                  <span className="text-sm text-warn-ink">Sin comprobante adjunto.</span>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <form action={confirmTransfer}>
                    <input type="hidden" name="id" value={r.id} />
                    <SmallSubmit tone="dark">Entró: confirmar</SmallSubmit>
                  </form>
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-alert-ink">No entró: rechazar</summary>
                    <form action={rejectTransfer} className="flex gap-2 pt-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        name="reason"
                        required
                        maxLength={200}
                        placeholder="Motivo (lo ve el alumno)"
                        aria-label="Motivo del rechazo"
                        className="h-10 min-w-0 flex-1 rounded-xl border border-edge bg-paper px-3 text-base outline-none focus:border-ink"
                      />
                      <SmallSubmit tone="danger">Rechazar</SmallSubmit>
                    </form>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
