import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/basics";
import { NoAccess } from "@/components/status/NoAccess";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Mis clases" };

const ITEMS = [
  "Tus clases del día y de la semana",
  "Cambios de sala o de horario",
  "Quiénes se esperan en cada clase"
];

export default async function Page() {
  const profile = await requireProfile();
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;
  return <ComingSoon title="Mis clases" intro="Acá vas a ver las clases que das." items={ITEMS} />;
}
