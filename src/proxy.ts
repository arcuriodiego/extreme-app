import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HOME_PATH, SIGN_IN_PATH, routeAccess } from "@/domain/auth/routes";
import { supabaseEnv } from "@/lib/supabase/env";
import { academyConfig } from "@/config/academy";

// La dirección vieja de la app lleva a la nueva (los avances de prueba de Vercel siguen funcionando).
const OLD_HOSTS = new Set(["extreme-app-tau.vercel.app"]);

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Se ejecuta antes de cada página:
 * 1. Renueva la sesión del usuario si está por vencer.
 * 2. Manda a "Ingresar" a quien entra a una página privada sin sesión.
 * 3. Manda al inicio a quien ya ingresó y abre "Ingresar" o "Registro".
 */

export async function proxy(request: NextRequest) {
  if (OLD_HOSTS.has(request.headers.get("host") ?? "")) {
    return NextResponse.redirect(`${academyConfig.appUrl}${request.nextUrl.pathname}${request.nextUrl.search}`, 308);
  }
  const env = supabaseEnv();
  let response = NextResponse.next({ request });
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() verifica la firma del token de la sesión (y lo renueva si hace falta).
  // Con las claves de firma de Supabase lo hace sin consultar al servidor en cada pedido,
  // así cada clic no espera un viaje extra. No confía sólo en la cookie: valida la firma.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;

  const access = routeAccess(request.nextUrl.pathname);

  if (access === "protected" && !user) {
    const url = request.nextUrl.clone();
    url.pathname = SIGN_IN_PATH;
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return redirectKeepingCookies(url, response);
  }

  if (access === "guest-only" && user) {
    const url = request.nextUrl.clone();
    url.pathname = HOME_PATH;
    url.search = "";
    return redirectKeepingCookies(url, response);
  }

  return response;
}

function redirectKeepingCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    // Todas las páginas menos archivos estáticos, imágenes y los íconos de la app.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|apple-icon.png|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
