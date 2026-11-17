import Image from "next/image";
import Link from "next/link";
import { MobileMenu, SideMenu } from "@/components/nav/SideMenu";
import { NoAccess } from "@/components/status/NoAccess";
import { academyConfig } from "@/config/academy";
import { roleLabel } from "@/domain/auth/roles";
import { gestionMenu } from "@/domain/navigation/menus";
import { requireProfile } from "@/lib/session";
import { runBackgroundTasks } from "@/lib/background";
import { signOut } from "@/app/(cuenta)/actions";
import { Bell } from "@/components/notices/Bell";
import { countUnread } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

// Páginas del personal: se arman en cada visita, nunca durante la compilación.
export const dynamic = "force-dynamic";

/**
 * Gestión (recepción y administración), pensada para computadora o tablet:
 * menú lateral con sólo las secciones que la persona puede abrir.
 */
export default async function GestionLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  await runBackgroundTasks();
  const menu = gestionMenu(profile.access);
  const unread = await createClient().then(countUnread).catch(() => 0);
  const mainRole = profile.access.roles.find((r) => r === "admin" || r === "reception");

  return (
    <div className="relative isolate mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
      {/* Fondo: la misma foto del show que en la app, más oscura para que las tablas se lean bien (queda quieta al bajar). */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div className="absolute inset-0 bg-[url('/brand/fondo-app.webp')] bg-cover bg-[center_35%] opacity-45" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,10,10,0.5),rgba(10,10,10,0.82)_55%,var(--color-paper)_95%)]" />
      </div>
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line px-5 py-3">
        <div>{menu.length > 0 && <MobileMenu items={menu} />}</div>
        <Link href="/admin" aria-label="Ir al panel de gestión">
          <Image
            src={academyConfig.logo.dark}
            alt={academyConfig.name}
            width={academyConfig.logo.width}
            height={academyConfig.logo.height}
            priority
            className="h-auto w-24 sm:w-28"
          />
        </Link>
        <div className="flex items-center justify-end gap-3 text-[15px] sm:gap-4 font-semibold">
          {mainRole && (
            <span className="hidden text-muted sm:inline">
              {roleLabel(mainRole)}
              {profile.firstName ? ` · ${profile.firstName}` : ""}
            </span>
          )}
          <Bell initial={unread} size={40} iconSize={20} />
          <Link href="/inicio" className="text-ink no-underline hover:underline">
            Mi inicio
          </Link>
          <form action={signOut}>
            <button type="submit" className="font-semibold text-brand-text hover:underline">
              Salir
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 gap-8 px-5 pb-12 pt-6">
        {menu.length > 0 && (
          <aside className="hidden w-56 shrink-0 lg:block">
            <SideMenu items={menu} />
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col gap-6">{menu.length > 0 ? children : <NoAccess />}</main>
      </div>
    </div>
  );
}
