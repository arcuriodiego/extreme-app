"use server";

import { redirect } from "next/navigation";
import { authErrorMessage } from "@/domain/auth/errors";
import { defaultNextFor, parseEmailLinkType, safeNextPath } from "@/domain/auth/routes";
import { createClient } from "@/lib/supabase/server";

export interface ConfirmState {
  error?: string;
}

/** Usa el código del enlace del email. Se ejecuta sólo cuando la persona toca el botón. */
export async function confirmEmailLink(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const type = parseEmailLinkType(formData.get("type"));
  const tokenHash = formData.get("token_hash");
  if (!type || typeof tokenHash !== "string" || !tokenHash) {
    return { error: "El enlace no es válido. Pedí uno nuevo." };
  }
  const next = safeNextPath(formData.get("next")) ?? defaultNextFor(type);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return {
      error:
        error.code === "otp_expired" || error.status === 403
          ? "El enlace venció o ya se usó. Pedí uno nuevo."
          : authErrorMessage(error),
    };
  }

  redirect(next);
}
