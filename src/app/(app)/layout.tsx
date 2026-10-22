import Image from "next/image";
import Link from "next/link";
import { TabBar } from "@/components/nav/TabBar";
import { academyConfig } from "@/config/academy";
import { hasGestion, personalTabs } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";

// Páginas personales: se arman en cada visita, nunca durante la compilación.
export const dynamic = "force-dynamic";

/**
 * Área personal (pensada para el celular): logo arriba y barra de secciones abajo.
 * El alumno ve Inicio · Clases · Mis pases · Pagos · Perfil; el profe, sus herramientas.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const tabs = personalTabs(profile.access);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between gap-4 px-5 pt-4">
        <Link href="/inicio" aria-label="Ir a mi inicio">
          <Image
            src={academyConfig.logo.light}
            alt={academyConfig.name}
            width={academyConfig.logo.width}
            height={academyConfig.logo.height}
            priority
            className="h-auto w-28"
          />
        </Link>
        {hasGestion(profile.access) && (
          <Link
            href="/admin"
            className="flex h-9 items-center rounded-full bg-ink px-3.5 text-sm font-bold text-white no-underline hover:bg-[#262626] hover:text-white"
          >
            Gestión
          </Link>
        )}
      </header>
      <main className="flex flex-1 flex-col gap-6 px-5 pb-28 pt-6">{children}</main>
      <TabBar items={tabs} />
    </div>
  );
}
