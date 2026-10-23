import { NextResponse, type NextRequest } from "next/server";

/**
 * Cambia entre la vista de alumno y la de profe (para profes que también toman clases).
 * Sólo guarda la preferencia en una cookie: qué puede ver cada uno lo sigue decidiendo el rol.
 */
export function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("m") === "alumno" ? "alumno" : "profe";
  const url = request.nextUrl.clone();
  url.pathname = "/inicio";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.cookies.set("modo", mode, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: true });
  return res;
}
