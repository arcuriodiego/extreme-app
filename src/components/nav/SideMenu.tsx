"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { activeKey, type NavItem } from "@/domain/navigation/menus";

function MenuLinks({ items }: { items: NavItem[] }) {
  const current = activeKey(items, usePathname());
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.key === current;
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold no-underline ${
                active ? "bg-ink text-white hover:text-white" : "text-ink hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon name={item.icon} size={20} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Menú lateral fijo en pantallas grandes. */
export function SideMenu({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Gestión" className="hidden lg:block">
      <MenuLinks items={items} />
    </nav>
  );
}

/** En celular o tablet chica, el mismo menú se despliega desde un botón. */
export function MobileMenu({ items }: { items: NavItem[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  // Al cambiar de página, el menú se cierra solo.
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return (
    <details ref={ref} className="relative lg:hidden">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-line px-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        Menú
      </summary>
      <nav aria-label="Gestión" className="absolute left-0 top-12 z-30 w-64 rounded-[var(--radius-card)] border border-line bg-white p-2 shadow-lg">
        <MenuLinks items={items} />
      </nav>
    </details>
  );
}
