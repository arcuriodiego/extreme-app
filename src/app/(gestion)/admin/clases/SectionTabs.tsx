import Link from "next/link";

/** Pestañas de la sección Clases y grilla. */
export function SectionTabs({ current, canManage }: { current: "profes" | "grilla" | "calendario" | "catalogo"; canManage: boolean }) {
  const tabs = [
    ...(canManage ? [{ key: "profes", href: "/admin/clases/profes", label: "Profes" }] : []),
    { key: "grilla", href: "/admin/clases?vista=grupos", label: "Todos los grupos" },
    { key: "calendario", href: "/admin/clases/calendario", label: "Calendario" },
    ...(canManage ? [{ key: "catalogo", href: "/admin/clases/catalogo", label: "Catálogo y salas" }] : []),
  ];
  return (
    <nav aria-label="Secciones de clases" className="-mx-5 overflow-x-auto px-5">
      <ul className="flex gap-5 border-b border-line">
        {tabs.map((t) => (
          <li key={t.key} className="shrink-0">
            <Link
              href={t.href}
              aria-current={t.key === current ? "page" : undefined}
              className={`-mb-px block border-b-2 pb-2.5 text-[15px] font-semibold no-underline ${
                t.key === current ? "border-brand text-ink hover:text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
