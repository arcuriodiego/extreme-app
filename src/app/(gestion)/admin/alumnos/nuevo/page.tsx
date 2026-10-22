import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { requireProfile } from "@/lib/session";
import { createStudent } from "../actions";
import { ERRORS } from "../messages";
import { StudentForm } from "../StudentForm";

export const metadata: Metadata = { title: "Nuevo alumno" };

export default async function NuevoAlumnoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!can(profile.access, "people.manage")) return <NoAccess />;
  const failure = params.error ? ERRORS[params.error] : undefined;

  return (
    <>
      <Link href="/admin/alumnos" className="self-start text-sm font-semibold">
        ‹ Alumnos
      </Link>
      <PageHeader
        title="Nuevo alumno"
        subtitle="Para quien todavía no tiene cuenta en la app (por ejemplo, un menor). Si la persona se registra sola, su ficha aparece automáticamente: no hace falta crearla."
      />
      {failure && <FormAlert kind="error">{failure}</FormAlert>}
      <StudentForm action={createStudent} />
    </>
  );
}
