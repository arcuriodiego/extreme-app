import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { StudentSwitcher } from "@/components/nav/StudentSwitcher";
import { TabBar } from "@/components/nav/TabBar";
import { academyConfig } from "@/config/academy";
import { canSwitchMode, hasGestion, personalTabs, resolveMode } from "@/domain/navigation/menus";
import { getActiveStudent } from "@/lib/active-student";
import { requireProfile } from "@/lib/session";

// Páginas personales: se arman en cada visita, nunca durante la compilación.
export const dynamic = "force-dynamic";

/**
 * Área personal (pensada para el celular): logo arriba y barra de secciones abajo.
 * El alumno ve Inicio · Clases · Mis pases · Pagos · Perfil; el profe, sus herramientas.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const chosen = (await cookies()).get("modo")?.value;
  const tabs = personalTabs(profile.access, chosen);
  const mode = resolveMode(profile.access, chosen);
  // Tutores: a quién se está viendo (él o uno de sus hijos).
  const { active, options } = mode === "alumno" ? await getActiveStudent() : { active: null, options: [] };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pt-4">
        <span aria-hidden="true" />
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
            className="flex h-9 items-center justify-self-end rounded-full bg-ink px-3.5 text-sm font-bold text-white no-underline hover:bg-[#262626] hover:text-white"
          >
            Gestión
          </Link>
        )}
      </header>
      {canSwitchMode(profile.access) && (
        <div className="px-5 pt-3">
          <a
            href={`/modo?m=${mode === "profe" ? "alumno" : "profe"}`}
            className="flex items-center justify-center gap-2 rounded-full border border-line py-1.5 text-sm font-semibold text-ink no-underline hover:border-ink hover:text-ink"
          >
            Estás en la vista de {mode === "profe" ? "profe" : "alumno"} · Cambiar a {mode === "profe" ? "alumno" : "profe"}
          </a>
        </div>
      )}
      {active && options.length > 1 && (
        <div className="px-5 pt-3">
          <StudentSwitcher options={options.map((o) => ({ id: o.id, label: o.isSelf ? "Yo" : o.firstName }))} activeId={active.id} />
        </div>
      )}
      <main className="flex flex-1 flex-col gap-6 px-5 pb-28 pt-6">{children}</main>
      <TabBar items={tabs} />
    </div>
  );
}
