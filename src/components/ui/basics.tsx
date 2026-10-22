import Link from "next/link";

/**
 * Piezas básicas del sistema de diseño. Todas las pantallas se arman con estas,
 * así la app se ve igual en todas partes y un cambio de estilo se hace en un solo lugar.
 */

/** Título de pantalla, con bajada opcional. */
export function PageHeader({ title, subtitle, eyebrow }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {eyebrow && <span className="text-[13px] font-bold uppercase tracking-wider text-muted">{eyebrow}</span>}
      <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-wide">{title}</h1>
      {subtitle && <p className="text-[15px] leading-snug text-muted">{subtitle}</p>}
    </div>
  );
}

/** Contenedor con borde para agrupar información. */
export function Card({ children, title, className = "" }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <section className={`flex flex-col gap-2 rounded-[var(--radius-card)] border border-line p-5 ${className}`}>
      {title && <h2 className="font-display text-xl font-bold uppercase tracking-wide">{title}</h2>}
      {children}
    </section>
  );
}

/** Tarjeta completa que lleva a otra pantalla. */
export function LinkCard({
  href,
  title,
  description,
  dark = false,
}: {
  href: string;
  title: string;
  description?: string;
  dark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-3 rounded-[var(--radius-card)] p-5 no-underline ${
        dark
          ? "bg-ink text-white hover:bg-[#262626] hover:text-white"
          : "border border-line text-ink hover:border-ink hover:text-ink"
      }`}
    >
      <span className="flex flex-col gap-1">
        <span className="font-display text-xl font-bold uppercase tracking-wide">{title}</span>
        {description && <span className={`text-[15px] ${dark ? "text-[#cfcfcf]" : "text-muted"}`}>{description}</span>}
      </span>
      <span aria-hidden="true" className="text-2xl">
        ›
      </span>
    </Link>
  );
}

const buttonStyles = {
  primary: "bg-brand text-white hover:bg-brand-hover hover:text-white",
  secondary: "border-[1.5px] border-ink bg-white text-ink hover:bg-surface hover:text-ink",
  dark: "bg-ink text-white hover:bg-[#262626] hover:text-white",
} as const;

/** Enlace con forma de botón. Rojo sólo para la acción principal de la pantalla. */
export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof buttonStyles;
}) {
  return (
    <Link
      href={href}
      className={`flex h-12 items-center justify-center rounded-xl px-5 text-base font-bold no-underline transition-colors ${buttonStyles[variant]}`}
    >
      {children}
    </Link>
  );
}

/**
 * Sección que todavía no está construida. Dice qué va a haber,
 * para que nadie piense que algo se rompió.
 */
export function ComingSoon({ title, intro, items }: { title: string; intro: string; items: readonly string[] }) {
  return (
    <>
      <PageHeader title={title} />
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-5">
        <span className="self-start rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold tracking-wide text-white">
          PRÓXIMAMENTE
        </span>
        <p className="text-[15px] leading-snug">{intro}</p>
        <ul className="flex flex-col gap-1.5 text-[15px] text-muted">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true">·</span>
              {item}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
