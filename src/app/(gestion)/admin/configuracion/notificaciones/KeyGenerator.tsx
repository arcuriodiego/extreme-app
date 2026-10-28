"use client";

import { useState } from "react";
import { bytesToBase64Url } from "@/domain/push/push";

/**
 * Genera las claves VAPID en este navegador (nunca pasan por el servidor ni por el chat).
 * Se copian a Vercel como variables de entorno.
 */
export function KeyGenerator() {
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    setKeys({ publicKey: bytesToBase64Url(raw), privateKey: jwk.d ?? "" });
    setCopied(null);
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied(null);
    }
  }

  if (!keys) {
    return (
      <div>
        <button type="button" onClick={generate} className="h-10 rounded-full border border-ink bg-ink px-4 text-sm font-semibold text-white">
          Generar claves
        </button>
      </div>
    );
  }

  const row = (name: string, value: string) => (
    <div className="flex flex-col gap-1.5 rounded-xl bg-surface p-3">
      <span className="text-sm font-semibold">Nombre (Key): {name}</span>
      <code className="break-all rounded-lg bg-white px-2 py-1.5 text-xs">{value}</code>
      <div>
        <button type="button" onClick={() => copy(name, value)} className="h-8 rounded-full border border-[#cfcfcf] bg-white px-3 text-xs font-semibold">
          {copied === name ? "Copiada ✓" : "Copiar valor"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {row("VAPID_PUBLIC_KEY", keys.publicKey)}
      {row("VAPID_PRIVATE_KEY", keys.privateKey)}
      <p className="text-sm text-muted">
        Estas claves no se guardan en ningún lado: si cerrás la página antes de cargarlas en Vercel, generá otras. No las compartas por chat ni por email.
      </p>
    </div>
  );
}
