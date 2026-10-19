import type { Metadata } from "next";
import { ProfileForm } from "@/app/(cuenta)/forms";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function PerfilPage() {
  const profile = await requireProfile();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Mi perfil</h1>
        <p className="text-[15px] text-muted">{profile.email}</p>
      </div>
      <ProfileForm
        initialValues={{
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          birthDate: profile.birthDate,
        }}
      />
    </>
  );
}
