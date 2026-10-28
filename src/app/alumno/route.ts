import { NextResponse, type NextRequest } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGES = ["/inicio", "/clases", "/pases", "/pagos"];

/**
 * El tutor elige a quién ver (él o uno de sus hijos). Sólo guarda la elección:
 * si no es un alumno suyo, la app la ignora y la base no devuelve sus datos.
 */
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const to = request.nextUrl.searchParams.get("a") ?? "";
  const url = request.nextUrl.clone();
  url.pathname = PAGES.includes(to) ? to : "/inicio";
  url.search = "";
  const res = NextResponse.redirect(url);
  if (id === "todos") {
    url.pathname = "/inicio";
    const res2 = NextResponse.redirect(url);
    res2.cookies.set("alumno", "todos", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: true });
    return res2;
  }
  if (UUID.test(id)) {
    res.cookies.set("alumno", id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: true });
  }
  return res;
}
