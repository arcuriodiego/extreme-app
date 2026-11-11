import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { academyConfig } from "@/config/academy";
import { methodLabel } from "@/domain/billing/payments";
import { receiptMessage, whatsappLink, whatsappNumber } from "@/domain/billing/whatsapp";
import { canOpen } from "@/domain/navigation/menus";
import { formatARS } from "@/domain/shared/money";
import { loadContacts, loadReceipt, receiptUrl } from "@/lib/receipts";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recibo" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: academyConfig.timeZone,
});

/** Recibo recién cobrado (o de un pago anterior): resumen y botones para mandarlo por WhatsApp. */
export default async function ReciboPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ alumno?: string; aviso?: string }>;
}) {
  const [profile, { id }, query] = await Promise.all([requireProfile(), params, searchParams]);
  if (!canOpen(profile.access, "pagos")) return <NoAccess />;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const receipt = await loadReceipt(supabase, id);
  if (!receipt) notFound();
  const contacts = await loadContacts(supabase, receipt.students);
  const url = receiptUrl(receipt.token);
  const back = query.alumno && UUID.test(query.alumno) ? `/admin/alumnos/${query.alumno}` : "/admin/pagos";
  const message = (name: string | null) =>
    receiptMessage({
      academy: academyConfig.name,
      contactName: name,
      number: receipt.number,
      studentNames: receipt.students.map((s) => s.name),
      totalCents: receipt.totalCents,
      url,
    });

  return (
    <>
      <PageHeader eyebrow="Recibo" title={`N° ${receipt.number}`} subtitle={dateTime.format(new Date(receipt.issuedAt))} />
      {query.aviso === "pago-registrado" && <FormAlert kind="ok">Listo, registramos el pago. Mandá el recibo por WhatsApp.</FormAlert>}
      {receipt.voided && <FormAlert kind="error">Este recibo tiene un pago anulado.</FormAlert>}

      <section className="flex max-w-2xl flex-col gap-2 rounded-[var(--radius-card)] border border-line p-4">
        <ul className="flex flex-col">
          {receipt.items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[15px] last:border-b-0">
              <span className="flex flex-col">
                <span className="font-semibold">{it.studentName}</span>
                <span className="text-sm text-muted">{it.description}</span>
              </span>
              <strong>{formatARS(it.amountCents)}</strong>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-ink pt-2">
          <span className="text-sm text-muted">{receipt.methods.map(methodLabel).join(" · ")}</span>
          <strong className="font-display text-2xl">{formatARS(receipt.totalCents)}</strong>
        </div>
      </section>

      <section className="flex max-w-2xl flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Mandar por WhatsApp</h2>
        {contacts.length === 0 && <p className="text-[15px] text-muted">Esta ficha no tiene teléfonos cargados. Elegí el contacto en WhatsApp.</p>}
        <ul className="flex flex-col gap-2">
          {contacts.map((c, i) => {
            const ok = whatsappNumber(c.phone) !== null;
            return (
              <li key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
                <span className="flex flex-col">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-sm text-muted">
                    {c.label}
                    {c.phone ? ` · ${c.phone}` : " · Sin teléfono"}
                  </span>
                </span>
                {ok ? (
                  <a
                    href={whatsappLink(c.phone, message(c.name))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center rounded-full bg-ok px-4 text-sm font-bold text-paper"
                  >
                    Enviar por WhatsApp
                  </a>
                ) : (
                  <span className="text-sm text-muted">{c.phone ? "Teléfono inválido" : ""}</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <a href={whatsappLink(null, message(null))} target="_blank" rel="noopener noreferrer" className="underline">
            Elegir otro contacto en WhatsApp
          </a>
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            Ver el recibo como lo recibe la familia
          </a>
        </div>
      </section>

      <Link href={back} className="text-sm font-semibold underline">
        Volver
      </Link>
    </>
  );
}
