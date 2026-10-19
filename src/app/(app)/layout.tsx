import Image from "next/image";
import Link from "next/link";
import { academyConfig } from "@/config/academy";
import { signOut } from "@/app/(cuenta)/actions";

/**
 * Marco provisorio de las páginas con sesión.
 * La navegación completa por rol (barra inferior del alumno, menú lateral
 * de recepción y administración) llega con la Entrega 4.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between gap-4 px-5 pt-4">
        <Link href="/inicio" aria-label="Ir a mi inicio">
          <Image
            src={academyConfig.logo.light}
            alt={academyConfig.name}
            width={academyConfig.logo.width}
            height={academyConfig.logo.height}
            className="h-auto w-28"
          />
        </Link>
        <nav aria-label="Cuenta" className="flex items-center gap-4 text-[15px] font-semibold">
          <Link href="/perfil" className="text-ink no-underline hover:underline">
            Mi perfil
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
