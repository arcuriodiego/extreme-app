import type { Metadata } from "next";
import { NoAccess } from "@/components/status/NoAccess";
import { ComingSoon } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Configuración" };

const ITEMS = [
  "Datos de la academia, sedes y salas",
  "Precios de cuotas, packs y clases",
  "Reglas: días de gracia, cancelación, créditos"
];

export default async function Page() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "configuracion")) return <NoAccess />;
  return <ComingSoon title="Configuración" intro="Los datos y reglas de la academia." items={ITEMS} />;
}
