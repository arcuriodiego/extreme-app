import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/forms/fields";
import { RoleBadges } from "@/components/status/RoleBadges";
import { LinkCard } from "@/components/ui/basics";
import { hasGestion } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Inicio" };

const notices: Record<string, string> = {
  "clave-actualizada": "Listo, tu contraseña nueva ya está activa.",
};

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  const notice = params.aviso ? notices[params.aviso] : undefined;
  const missingData = !profile.phone || !profile.birthDate;
  const showGestion = hasGestion(profile.access);

  return (
    <>
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">
          Hola{profile.firstName ? `, ${profile.firstName}` : ""}
        </h1>
        <RoleBadges roles={profile.access.roles} />
      </div>

      {showGestion && <LinkCard href="/admin" title="Gestión" description="Alumnos, clases, pagos y más" dark />}

      <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line p-5">
        <span className="font-display text-xl font-bold uppercase tracking-wide">Tu cuenta está lista</span>
        <p className="text-[15px] leading-snug text-muted">
          Muy pronto vas a ver acá tus clases, el estado de tu cuota y tu pase para entrar.
        </p>
      </section>

      {missingData && (
        <Link
          href="/perfil"
          className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line p-4 text-ink no-underline hover:border-ink"
        >
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Completá tus datos</span>
            <span className="text-sm text-muted">Teléfono y fecha de nacimiento, para avisos importantes.</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      )}
    </>
  );
}
