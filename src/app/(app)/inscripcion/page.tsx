import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/basics";
import { getActiveStudent } from "@/lib/active-student";
import { loadGroups } from "@/lib/grilla";
import { loadActiveMemberships } from "@/lib/memberships";
import { requireProfile } from "@/lib/session";
import { loadPendingSignup, signupSlots } from "@/lib/signups";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Inscripción" };

export default async function InscripcionPage({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  const [profile, params, { options }] = await Promise.all([requireProfile(), searchParams, getActiveStudent()]);
  const supabase = await createClient();
  const self = options.find((o) => o.isSelf) ?? null;
  const [groups, selfMemberships, selfPending] = await Promise.all([
    loadGroups(supabase, { onlyActive: true }),
    self ? loadActiveMemberships(supabase, self.id).catch(() => []) : Promise.resolve([]),
    self ? loadPendingSignup(supabase, self.id) : Promise.resolve(null),
  ]);
  const selfDone = selfMemberships.length > 0 || selfPending !== null;
  const canSelf = profile.access.roles.includes("student");
  const defaultFor = !canSelf || params.para === "hijo" || selfDone ? "child" : "self";

  return (
    <>
      <Link href="/inicio" className="self-start text-sm font-semibold">
        ‹ Inicio
      </Link>
      <PageHeader title="Inscripción" subtitle={canSelf ? "Completá los datos y elegí tus clases. La cuota se paga en recepción." : "Cargá los datos de tu hijo/a y elegí sus clases. La cuota se paga en recepción."} />
      <SignupForm slots={signupSlots(groups)} defaultFor={defaultFor} phone={profile.phone} birthDate={profile.birthDate} selfDone={selfDone} canSelf={canSelf} />
    </>
  );
}
