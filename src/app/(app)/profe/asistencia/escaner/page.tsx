import type { Metadata } from "next";
import Link from "next/link";
import { Scanner } from "@/components/access/Scanner";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { scanAccessCode } from "@/app/(gestion)/admin/escaner/actions";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Escanear pases" };

export default async function ProfeEscanerPage() {
  const profile = await requireProfile();
  if (!profile.access.roles.includes("teacher")) return <NoAccess />;
  return (
    <>
      <Link href="/profe/asistencia" className="text-sm font-semibold">
        ← Asistencia
      </Link>
      <PageHeader title="Escanear pases" subtitle="Cada pase escaneado queda como presente en la clase que está por empezar." />
      <Scanner onCode={scanAccessCode} />
    </>
  );
}
