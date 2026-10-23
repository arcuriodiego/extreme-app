import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { requireProfile } from "@/lib/session";
import { createWorkshop } from "../actions";
import { ERRORS } from "../messages";
import { WorkshopForm } from "../WorkshopForm";

export const metadata: Metadata = { title: "Nuevo workshop" };

export default async function NuevoWorkshopPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!can(profile.access, "classes.manage")) return <NoAccess />;
  const failure = params.error ? ERRORS[params.error] : undefined;
  return (
    <>
      <Link href="/admin/workshops" className="self-start text-sm font-semibold">
        ‹ Workshops
      </Link>
      <PageHeader title="Nuevo workshop" subtitle="Se crea como borrador: después le agregás las fechas y lo publicás." />
      {failure && <FormAlert kind="error">{failure}</FormAlert>}
      <WorkshopForm action={createWorkshop} />
    </>
  );
}
