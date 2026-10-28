"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/** Evento que avisa a la campanita que se leyeron los avisos. */
export const NOTICES_READ_EVENT = "avisos-leidos";

/**
 * Campanita con los avisos sin leer. El marco de la app no se vuelve a cargar al
 * cambiar de pantalla, así que el número se consulta de nuevo en cada pantalla
 * (y se pone en cero apenas se leen los avisos).
 */
export function Bell({ initial, size = 44, iconSize = 22, className = "" }: { initial: number; size?: number; iconSize?: number; className?: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState(initial);

  useEffect(() => {
    // En Avisos se marcan leídos: ahí la campanita espera ese aviso (evita mostrar el número viejo).
    if (pathname === "/avisos") return;
    let cancelled = false;
    fetch("/api/avisos/sin-leer", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => {
        if (!cancelled && d && typeof d.count === "number") setCount(d.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const clear = () => setCount(0);
    window.addEventListener(NOTICES_READ_EVENT, clear);
    return () => window.removeEventListener(NOTICES_READ_EVENT, clear);
  }, []);

  return (
    <Link
      href="/avisos"
      aria-label={count > 0 ? `Avisos: ${count} sin leer` : "Avisos"}
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center rounded-full border border-line text-ink hover:border-ink hover:text-ink ${className}`}
    >
      <Icon name="bell" size={iconSize} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
