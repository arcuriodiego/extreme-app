import type { Metadata } from "next";
import { NoAccess } from "@/components/status/NoAccess";
import { ComingSoon } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Panel" };

const ITEMS = [
  "Clases de hoy, ocupación y quiénes ingresaron",
  "Cuotas por vencer, en gracia y suspendidas",
  "Ingresos del mes por medio de pago",
  "Avisos que requieren atención"
];

export default async function Page() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "panel")) return <NoAccess />;
  return <ComingSoon title="Panel" intro="El resumen del día y del mes, de un vistazo." items={ITEMS} />;
}
