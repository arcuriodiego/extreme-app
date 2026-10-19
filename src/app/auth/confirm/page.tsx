import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { academyConfig } from "@/config/academy";
import { defaultNextFor, parseEmailLinkType, safeNextPath } from "@/domain/auth/routes";
import { ConfirmButton } from "./confirm-button";

export const metadata: Metadata = { title: "Confirmar", robots: { index: false } };

/**
 * Pantalla a la que llevan los enlaces de los emails.
 *
 * El código del enlace se usa recién cuando la persona toca el botón.
 * Así, los revisores automáticos de Outlook, Hotmail y antivirus, que abren
 * los enlaces pero no tocan botones, no lo gastan antes de tiempo.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const params = await searchParams;
  const type = parseEmailLinkType(params.type);
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const valid = Boolean(type && tokenHash);
  const next = type ? (safeNextPath(params.next) ?? defaultNextFor(type)) : "/";

  const copy =
    type === "recovery"
      ? { title: "Contraseña nueva", text: "Tocá el botón para crear una contraseña nueva.", button: "Crear contraseña nueva" }
      : type === "email_change"
        ? { title: "Cambio de email", text: "Tocá el botón para confirmar tu email nuevo.", button: "Confirmar email" }
        : { title: "Activar cuenta", text: "Tocá el botón para activar tu cuenta y entrar.", button: "Activar mi cuenta" };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-5 pb-12 pt-8">
      <Image
        src={academyConfig.logo.light}
        alt={academyConfig.name}
        width={academyConfig.logo.width}
        height={academyConfig.logo.height}
        priority
        className="h-auto w-44"
      />
      {valid ? (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">{copy.title}</h1>
            <p className="text-[15px] text-muted">{copy.text}</p>
          </div>
          <ConfirmButton tokenHash={tokenHash} type={type!} next={next} label={copy.button} />
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">Enlace incompleto</h1>
          <p className="text-[15px] text-muted">
            El enlace no tiene todos sus datos. Abrilo de nuevo desde el email o pedí uno nuevo.
          </p>
          <Link href="/recuperar" className="font-semibold">
            Pedir un enlace nuevo
          </Link>
        </section>
      )}
    </main>
  );
}
