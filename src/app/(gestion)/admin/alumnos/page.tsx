import type { Metadata } from "next";
import { NoAccess } from "@/components/status/NoAccess";
import { ComingSoon } from "@/components/ui/basics";
import { canOpen } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Alumnos" };

const ITEMS = [
  "Buscar e inscribir alumnos",
  "Planes, clases fijas y estado de cuota",
  "Historial de pagos y asistencia",
  "Tutores de alumnos menores"
];

export default async function Page() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "alumnos")) return <NoAccess />;
  return <ComingSoon title="Alumnos" intro="La ficha de cada alumno y todo lo que hace falta en el mostrador." items={ITEMS} />;
}
