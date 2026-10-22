import type { Metadata } from "next";
import { NoAccess } from "@/components/status/NoAccess";
import { ComingSoon } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Clases y grilla" };

const ITEMS = [
  "Estilos, niveles, profes y salas",
  "Grilla semanal con cupos",
  "Clases fijas y reservas",
  "Feriados y cambios de sala"
];

export default async function Page() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "clases")) return <NoAccess />;
  return <ComingSoon title="Clases y grilla" intro="La grilla de la academia y sus listas." items={ITEMS} />;
}
