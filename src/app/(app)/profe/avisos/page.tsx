import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/basics";
import { NoAccess } from "@/components/status/NoAccess";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Avisos" };

const ITEMS = [
  "Enviar un aviso a los alumnos de una clase",
  "Llega por la app y por mail"
];

export default async function Page() {
  const profile = await requireProfile();
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;
  return <ComingSoon title="Avisos" intro="Acá vas a poder avisarles algo a tus grupos." items={ITEMS} />;
}
