import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { HOME_PATH, SIGN_IN_PATH, safeNextPath } from "@/domain/auth/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino de los enlaces que mandamos por email:
 * confirmación de cuenta y recuperación de contraseña.
 * Acepta los dos formatos que usa Supabase (code o token_hash).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(url.searchParams.get("next")) ?? HOME_PATH;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const failed = new URL(SIGN_IN_PATH, url.origin);
  failed.searchParams.set("error", "enlace");
  return NextResponse.redirect(failed);
}
