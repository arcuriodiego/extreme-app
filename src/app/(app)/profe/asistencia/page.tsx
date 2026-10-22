import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/basics";
import { NoAccess } from "@/components/status/NoAccess";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Asistencia" };

const ITEMS = [
  "Escanear el QR de cada alumno al entrar",
  "Marcar presentes a mano si hace falta",
  "Ver quién falta y quién reservó"
];

export default async function Page() {
  const profile = await requireProfile();
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;
  return <ComingSoon title="Asistencia" intro="Acá vas a tomar asistencia en tus clases." items={ITEMS} />;
}
