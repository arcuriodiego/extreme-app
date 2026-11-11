import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { academyConfig } from "@/config/academy";
import { can } from "@/domain/auth/roles";
import { hasTransferInfo, reminderMessage, whatsappLink, whatsappNumber } from "@/domain/billing/whatsapp";
import { formatARS } from "@/domain/shared/money";
import { ensureCharges } from "@/lib/billing";
import { academyToday } from "@/lib/grilla";
import { loadReminderFamilies, loadTransferInfo } from "@/lib/receipts";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { sendReminder } from "../actions";

export const metadata: Metadata = { title: "Recordatorios de cuota" };

const ERRORS: Record<string, string> = {
  datos: "No pudimos armar ese recordatorio. Recargá la página.",
  "sin-permiso": "No tenés permiso para mandar recordatorios.",
  generico: "No pudimos registrar el recordatorio. Probá de nuevo.",
};

const sentFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: academyConfig.timeZone });

/** Recordatorios de cuota por WhatsApp: una fila por familia (hermanos con el mismo tutor van juntos). */
export default async function RecordatoriosPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [profile, query] = await Promise.all([requireProfile(), searchParams]);
  if (!can(profile.access, "payments.register")) return <NoAccess />;

  const today = academyToday();
  const supabase = await createClient();
  await ensureCharges(supabase);
  const [families, transfer] = await Promise.all([loadReminderFamilies(supabase, today), loadTransferInfo(supabase)]);
  const failure = query.error ? (ERRORS[query.error] ?? ERRORS.generico) : undefined;
  const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

  return (
    <>
      <PageHeader
        title="Recordatorios"
        subtitle="Cuotas vencidas o por vencer. Tocá Enviar: se abre WhatsApp con el mensaje listo para esa familia."
      />
      {failure && <FormAlert kind="error">{failure}</FormAlert>}
      {!hasTransferInfo(transfer) && (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-[15px] text-warn-ink">
          Todavía no cargaste los datos para transferir: el mensaje sale sin alias ni CBU. Cargalos en{" "}
          <Link href="/admin/configuracion#transferencias" className="font-semibold underline">
            Configuración
          </Link>
          .
        </p>
      )}

      {families.length === 0 ? (
        <p className="rounded-xl bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-ink">No hay cuotas vencidas ni por vencer.</p>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-3">
          {families.map((f) => {
            const text = reminderMessage({
              academy: academyConfig.name,
              contactName: f.contact.name,
              charges: f.charges,
              today,
              transfer,
              appUrl: academyConfig.appUrl,
            });
            const valid = whatsappNumber(f.contact.phone) !== null;
            const overdue = f.charges.some((c) => c.dueDate < today);
            return (
              <li key={f.key} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="font-semibold">{f.contact.name}</span>
                    <span className="text-sm text-muted">
                      {f.contact.label} · {f.contact.phone ?? "sin teléfono"}
                    </span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${overdue ? "bg-alert-soft text-alert-ink" : "bg-warn-soft text-warn-ink"}`}>
                    {overdue ? "VENCIDA" : "POR VENCER"}
                  </span>
                </div>
                <ul className="flex flex-col text-[15px]">
                  {f.charges.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 border-t border-line py-1.5">
                      <Link href={`/admin/alumnos/${c.studentId}`} className="underline-offset-2 hover:underline">
                        {c.studentName.split(" ")[0]} · {c.description} · vence {fmt(c.dueDate)}
                      </Link>
                      <strong className="shrink-0">{formatARS(c.cashCents ?? c.totalCents)}</strong>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-3">
                  <form action={sendReminder}>
                    <input type="hidden" name="family_key" value={f.key} />
                    {f.charges.map((c) => (
                      <input key={c.id} type="hidden" name="charge_id" value={c.id} />
                    ))}
                    <input type="hidden" name="href" value={whatsappLink(valid ? f.contact.phone : null, text)} />
                    <SmallSubmit tone="dark">{valid ? "Enviar por WhatsApp" : "Elegir contacto en WhatsApp"}</SmallSubmit>
                  </form>
                  <span className="text-sm text-muted">
                    {f.lastSentAt ? `Último recordatorio: ${sentFormat.format(new Date(f.lastSentAt))}` : "Todavía no se le mandó recordatorio"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/admin/pagos" className="text-sm font-semibold underline">
        Volver a Pagos
      </Link>
    </>
  );
}
