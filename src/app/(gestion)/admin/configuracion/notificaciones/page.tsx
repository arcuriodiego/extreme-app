import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { vapidKeys, vapidStatus } from "@/lib/push-delivery";
import { requireProfile } from "@/lib/session";
import { KeyGenerator } from "./KeyGenerator";

export const metadata: Metadata = { title: "Notificaciones al celular" };

/** Configuración única de las claves de las notificaciones (sólo administración). */
export default async function NotificacionesConfigPage() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "configuracion")) return <NoAccess />;
  const ready = vapidKeys() !== null;
  const status = vapidStatus();
  const label = { ok: "cargada ✓", falta: "no está cargada", invalida: "está cargada pero el valor no es válido (¿quedó con espacios o incompleto?)" } as const;

  return (
    <>
      <Link href="/admin/configuracion" className="self-start text-sm font-semibold">
        ‹ Configuración
      </Link>
      <PageHeader title="Notificaciones al celular" subtitle="Claves para que la app pueda mandar notificaciones." />
      {ready ? (
        <p className="max-w-2xl rounded-xl bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-ink">
          Listas: las notificaciones están configuradas. Cada persona las activa desde Perfil o Avisos en su celular.
        </p>
      ) : (
        <section className="flex max-w-2xl flex-col gap-4">
          <p className="rounded-xl bg-warn-soft px-4 py-3 text-[15px] text-warn-ink">
            Todavía no están configuradas. Se hace una sola vez:
          </p>
          <ul className="flex flex-col gap-1 text-[15px]">
            <li>
              <strong>VAPID_PUBLIC_KEY</strong>: {label[status.publicKey]}
            </li>
            <li>
              <strong>VAPID_PRIVATE_KEY</strong>: {label[status.privateKey]}
            </li>
          </ul>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px]">
            <li>Tocá &quot;Generar claves&quot; (se crean en esta computadora).</li>
            <li>
              En Vercel: proyecto <strong>extreme-app</strong> → Settings → Environment Variables → <strong>Add</strong>. Cargá las dos, una por una, con el nombre
              exacto y el valor copiado. La privada, de tipo <strong>Secret</strong> (Sensitive).
            </li>
            <li>En Vercel → Deployments → el último → ⋯ → <strong>Redeploy</strong>, para que la app tome las claves.</li>
            <li>Volvé a esta página: tiene que decir &quot;Listas&quot;.</li>
          </ol>
          <KeyGenerator />
        </section>
      )}
    </>
  );
}
