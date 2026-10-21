import Image from "next/image";
import Link from "next/link";
import { academyConfig } from "@/config/academy";
import { signOut } from "@/app/(cuenta)/actions";

// Páginas del personal: se arman en cada visita, nunca durante la compilación.
export const dynamic = "force-dynamic";

/**
 * Marco provisorio de las páginas de gestión (recepción y administración).
 * Más ancho que el del alumno, pensado para computadora o tablet.
 * El menú lateral completo de los wireframes llega con la Entrega 4.
 */
export default function GestionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
        <Link href="/inicio" aria-label="Ir a mi inicio">
          <Image
            src={academyConfig.logo.light}
            alt={academyConfig.name}
            width={academyConfig.logo.width}
            height={academyConfig.logo.height}
            className="h-auto w-28"
          />
        </Link>
        <nav aria-label="Gestión" className="flex items-center gap-5 text-[15px] font-semibold">
          <Link href="/admin/usuarios" className="text-ink no-underline hover:underline">
            Usuarios y roles
          </Link>
          <Link href="/inicio" className="text-ink no-underline hover:underline">
            Mi inicio
          </Link>
          <form action={signOut}>
            <button type="submit" className="font-semibold text-brand hover:underline">
              Salir
            </button>
          </form>
        </nav>
      </header>
      <main className="flex flex-1 flex-col gap-6 px-5 pb-12 pt-6">{children}</main>
    </div>
  );
}
