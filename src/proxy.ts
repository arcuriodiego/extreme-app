import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HOME_PATH, SIGN_IN_PATH, routeAccess } from "@/domain/auth/routes";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Se ejecuta antes de cada página:
 * 1. Renueva la sesión del usuario si está por vencer.
 * 2. Manda a "Ingresar" a quien entra a una página privada sin sesión.
 * 3. Manda al inicio a quien ya ingresó y abre "Ingresar" o "Registro".
 */
export async function proxy(request: NextRequest) {
  const env = supabaseEnv();
  let response = NextResponse.next({ request });
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() valida la sesión contra Supabase; no confiar sólo en la cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-icon.png|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
