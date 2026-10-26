import type { Metadata } from "next";
import { signOut } from "@/app/(cuenta)/actions";
import { ProfileForm } from "@/app/(cuenta)/forms";
import Link from "next/link";
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
      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <Link href="/documentos" className="font-semibold">
          Reglamento y documentos
        </Link>
        <Link href="/nueva-clave" className="font-semibold">
          Cambiar mi contraseña
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center rounded-xl border-[1.5px] border-ink bg-white font-bold text-ink hover:bg-surface"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </>
  );
}
