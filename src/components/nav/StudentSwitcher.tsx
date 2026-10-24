"use client";

import { usePathname } from "next/navigation";

/** Selector de a quién ver, para tutores: "Yo · Mateo · Sofía". */
export function StudentSwitcher({ options, activeId }: { options: { id: string; label: string }[]; activeId: string }) {
  const pathname = usePathname();
  const page = ["/inicio", "/clases", "/pases", "/pagos"].find((p) => pathname.startsWith(p)) ?? "/inicio";
  return (
    <nav aria-label="Ver a" className="flex gap-2 overflow-x-auto">
      {options.map((o) => {
        const on = o.id === activeId;
        return (
          <a
            key={o.id}
            href={`/alumno?id=${o.id}&a=${page}`}
            aria-current={on ? "true" : undefined}
            className={`flex h-10 shrink-0 items-center rounded-full border px-4 text-[15px] font-semibold no-underline ${
              on ? "border-ink bg-ink text-white hover:text-white" : "border-[#cfcfcf] bg-white text-ink hover:border-ink hover:text-ink"
            }`}
          >
            {o.label}
          </a>
        );
      })}
    </nav>
  );
}
