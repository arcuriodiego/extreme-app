"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormAlert, SubmitButton } from "@/components/forms/fields";
import { confirmEmailLink, type ConfirmState } from "./actions";

export function ConfirmButton({
  tokenHash,
  type,
  next,
  label,
}: {
  tokenHash: string;
  type: string;
  next: string;
  label: string;
}) {
  const [state, action] = useActionState<ConfirmState, FormData>(confirmEmailLink, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && (
        <>
          <FormAlert kind="error">{state.error}</FormAlert>
          <Link href={type === "recovery" ? "/recuperar" : "/ingresar"} className="font-semibold">
            {type === "recovery" ? "Pedir un enlace nuevo" : "Ir a ingresar"}
          </Link>
        </>
      )}
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      {!state.error && <SubmitButton pendingText="Verificando…">{label}</SubmitButton>}
    </form>
  );
}
