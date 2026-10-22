import type { Metadata } from "next";
import { NoAccess } from "@/components/status/NoAccess";
import { ComingSoon } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Escáner QR" };

const ITEMS = [
  "Escanear el pase QR con la cámara",
  "Ver al instante si la cuota está al día",
  "Registrar el ingreso a la clase"
];

export default async function Page() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "escaner")) return <NoAccess />;
  return <ComingSoon title="Escáner QR" intro="La validación de entrada en la puerta." items={ITEMS} />;
}
