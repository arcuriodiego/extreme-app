import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { loadCatalog } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { createGroup } from "../actions";
import { GroupForm } from "../GroupForm";
import { ERRORS } from "../messages";

export const metadata: Metadata = { title: "Nuevo grupo" };

export default async function NuevoGrupoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!can(profile.access, "classes.manage")) return <NoAccess />;

  const catalog = await loadCatalog(await createClient());
  const failure = params.error ? ERRORS[params.error] : undefined;

  return (
    <>
      <Link href="/admin/clases" className="self-start text-sm font-semibold">
        ‹ Clases y grilla
      </Link>
      <PageHeader title="Nuevo grupo" subtitle="El curso que se repite cada semana. Los días y horarios se agregan en el paso siguiente." />
      {failure && <FormAlert kind="error">{failure}</FormAlert>}
      <GroupForm catalog={catalog} action={createGroup} />
    </>
  );
}
