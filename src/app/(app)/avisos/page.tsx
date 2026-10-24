import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/basics";
import { ensureNotifications, loadMyNotifications, type NotificationKind } from "@/lib/notifications";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Avisos" };

const KIND: Record<NotificationKind, { label: string; tone: string }> = {
  due_soon: { label: "Cuota", tone: "bg-surface text-ink" },
  grace: { label: "Cuota vencida", tone: "bg-warn-soft text-warn-ink" },
  suspended: { label: "Acceso suspendido", tone: "bg-alert-soft text-alert-ink" },
  pack_expiring: { label: "Pack", tone: "bg-surface text-ink" },
  class_cancelled: { label: "Clase suspendida", tone: "bg-alert-soft text-alert-ink" },
  class_restored: { label: "Clase reprogramada", tone: "bg-ok-soft text-ok-ink" },
  announcement: { label: "Aviso de la academia", tone: "bg-ink text-white" },
};

const LINK_LABELS: Record<string, string> = { "/pagos": "Ver pagos", "/clases": "Ver clases" };

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

export default async function AvisosPage() {
  await requireProfile();
  const supabase = await createClient();
  await ensureNotifications(supabase);
  const items = await loadMyNotifications(supabase);
  // Se muestran como "nuevos" en esta visita y quedan leídos para la próxima.
  if (items.some((n) => !n.read)) await supabase.rpc("mark_notifications_read");

  return (
    <>
      <PageHeader title="Avisos" subtitle="Lo que la academia te avisa: cuotas, packs, clases suspendidas y mensajes." />
      {items.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">No tenés avisos por ahora.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id} className={`flex flex-col gap-1.5 rounded-xl border p-4 ${n.read ? "border-line" : "border-ink"}`}>
              <span className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${KIND[n.kind].tone}`}>{KIND[n.kind].label}</span>
                {!n.read && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">NUEVO</span>}
                <span className="text-sm text-muted">{dateFormat.format(new Date(n.createdAt))}</span>
              </span>
              <span className="font-semibold">{n.title}</span>
              {n.body && <span className="whitespace-pre-line text-[15px]">{n.body}</span>}
              {n.link && LINK_LABELS[n.link] && (
                <Link href={n.link} className="self-start text-sm font-semibold">
                  {LINK_LABELS[n.link]} →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
