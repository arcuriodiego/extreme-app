import type { Metadata } from "next";
import { signOut } from "@/app/(cuenta)/actions";
import { ProfileForm } from "@/app/(cuenta)/forms";
import Link from "next/link";
import { requireProfile } from "@/lib/session";
import { PushToggle } from "@/components/push/PushToggle";
import { vapidKeys } from "@/lib/push-delivery";
import { FormAlert } from "@/components/forms/fields";
import { IMAGE_ERRORS } from "@/domain/images/images";
import { createClient } from "@/lib/supabase/server";
import { PhotosSection } from "./PhotosSection";

export const metadata: Metadata = { title: "Mi perfil" };

const NOTICES: Record<string, string> = {
  "foto-profe": "Listo, subimos tu foto: ya aparece en la grilla y en tus clases.",
  "foto-alumno": "Listo, subimos la foto. Recepción ya la ve al registrar el ingreso.",
  "foto-quitada": "Listo, quitamos la foto.",
};
const ERRORS: Record<string, string> = {
  ...IMAGE_ERRORS,
  "sin-permiso": "No podés cambiar esa foto.",
  "no-disponible": "No encontramos esa ficha. Recargá la página.",
  datos: "Algo salió mal. Recargá la página y probá de nuevo.",
  generico: "No pudimos hacer el cambio. Probá de nuevo.",
};

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  const notice = params.aviso ? NOTICES[params.aviso] : undefined;
  const failure = params.error ? (ERRORS[params.error] ?? ERRORS.generico) : undefined;
  const supabase = await createClient();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Mi perfil</h1>
        <p className="text-[15px] text-muted">{profile.email}</p>
      </div>
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}
      <ProfileForm
        initialValues={{
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          birthDate: profile.birthDate,
        }}
      />
      <PhotosSection supabase={supabase} profileId={profile.id} isTeacher={profile.access.roles.includes("teacher")} />
      <PushToggle publicKey={vapidKeys()?.publicKey ?? null} />
      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <Link href="/documentos" className="font-semibold">
          Reglamento y documentos
        </Link>
        <Link href="/instalar" className="font-semibold">
          Instalar la app en el celular
        </Link>
        <Link href="/nueva-clave" className="font-semibold">
          Cambiar mi contraseña
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center rounded-xl border-[1.5px] border-ink bg-paper font-bold text-ink hover:bg-surface"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </>
  );
}
