import { NextResponse, type NextRequest } from "next/server";
import { HOME_PATH, SIGN_IN_PATH, safeNextPath } from "@/domain/auth/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino de los enlaces con el formato estándar de Supabase (?code=…).
 * Se mantiene por compatibilidad con las plantillas de email originales;
 * las plantillas propias usan /auth/confirm, que es resistente a los
 * revisores automáticos de enlaces de Outlook, Hotmail y antivirus.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next")) ?? HOME_PATH;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const failed = new URL(SIGN_IN_PATH, url.origin);
  failed.searchParams.set("error", "enlace");
  return NextResponse.redirect(failed);
}
