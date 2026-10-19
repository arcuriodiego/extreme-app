import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { requireSupabaseEnv } from "./env";

/**
 * Cliente de Supabase para el servidor (páginas, acciones y rutas).
 * Usa la sesión guardada en las cookies del navegador del usuario,
 * así cada consulta respeta los permisos de esa persona.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Desde una página de sólo lectura no se pueden escribir cookies;
          // el proxy de sesión ya las renueva en cada pedido.
        }
      },
    },
  });
}

/** Dirección pública de la app, para armar los enlaces de los emails. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
