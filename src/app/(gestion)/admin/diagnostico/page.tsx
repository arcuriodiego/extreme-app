import type { Metadata } from "next";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { measure } from "@/lib/diagnostics";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Diagnóstico" };

const REGIONS: Record<string, string> = {
  gru1: "São Paulo",
  iad1: "Washington",
  pdx1: "Portland (junto a la base de staging, en Oregón)",
  local: "Computadora local",
};

/** Mide la velocidad real del servidor. Sólo administración; no aparece en el menú. */
export default async function DiagnosticoPage() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "configuracion")) return <NoAccess />;

  const { region, timings } = await measure(await createClient());
  const total = timings.reduce((s, t) => s + t.ms, 0);

  return (
    <>
      <PageHeader title="Diagnóstico" subtitle="Tiempos medidos ahora, desde el servidor de la app. Recargá para medir de nuevo." />
      <p className="text-[15px]">
        Servidor de la app: <strong>{REGIONS[region] ?? region}</strong> ({region})
      </p>
      <ul className="flex max-w-xl flex-col">
        {timings.map((t) => (
          <li key={t.label} className="flex justify-between gap-3 border-t border-line py-2.5 text-[15px]">
            <span>
              {t.label}
              {t.note && <span className="ml-2 text-sm text-muted">{t.note}</span>}
              {!t.ok && <span className="ml-2 text-sm font-semibold text-alert-ink">(con error)</span>}
            </span>
            <strong className={t.ms > 300 ? "text-alert-ink" : t.ms > 120 ? "text-warn-ink" : "text-ok-ink"}>{t.ms} ms</strong>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-ink py-2.5 text-[15px] font-bold">
          <span>Total</span>
          <span>{total} ms</span>
        </li>
      </ul>
    </>
  );
}
