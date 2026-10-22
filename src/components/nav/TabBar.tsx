"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { activeKey, type NavItem } from "@/domain/navigation/menus";

/** Barra inferior del área personal (celular). Siempre visible, al alcance del pulgar. */
export function TabBar({ items }: { items: NavItem[] }) {
  const current = activeKey(items, usePathname());
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {items.map((item) => {
          const active = item.key === current;
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold no-underline ${
                  active ? "text-brand hover:text-brand" : "text-muted hover:text-ink"
                }`}
              >
                <Icon name={item.icon} size={24} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
