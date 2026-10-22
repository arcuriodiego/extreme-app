import type { Metadata } from "next";
import { NoAccess } from "@/components/status/NoAccess";
import { ComingSoon } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Pagos" };

const ITEMS = [
  "Registrar pagos en efectivo o transferencia",
  "Verificar comprobantes subidos por alumnos",
  "Pagos con Mercado Pago",
  "Resumen de ingresos (administración)"
];

export default async function Page() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "pagos")) return <NoAccess />;
  return <ComingSoon title="Pagos" intro="Cobros y control de lo que entra." items={ITEMS} />;
}
