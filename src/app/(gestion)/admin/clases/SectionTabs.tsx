import Link from "next/link";

/** Pestañas de la sección Clases y grilla. */
export function SectionTabs({ current, canManage }: { current: "grilla" | "catalogo"; canManage: boolean }) {
  const tabs = [
    { key: "grilla", href: "/admin/clases", label: "Grupos y horarios" },
    ...(canManage ? [{ key: "catalogo", href: "/admin/clases/catalogo", label: "Catálogo y salas" }] : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Secciones de clases" className="flex gap-2 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-1 pb-2.5 text-[15px] font-semibold no-underline ${
            t.key === current ? "border-brand text-ink hover:text-ink" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
