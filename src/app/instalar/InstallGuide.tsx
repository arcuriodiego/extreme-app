"use client";

import Link from "next/link";
import { useState } from "react";
import { type Platform, isInAppBrowser } from "@/domain/install/platform";
import { InstallSteps } from "@/components/install/InstallSteps";
import { useBrowserValue, useInstallState } from "@/components/install/useInstallState";

/** Guía para instalar, con la pestaña del celular que se detectó ya elegida. */
export function InstallGuide() {
  const { ready, platform, installed, nativePrompt } = useInstallState();
  const [picked, setPicked] = useState<"ios" | "android" | null>(null);
  const tab = picked ?? (platform === "android" ? "android" : "ios");
  const inApp = useBrowserValue(() => isInAppBrowser(navigator.userAgent), false);

  if (ready && installed) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok-ink">Ya tenés la app instalada.</p>
        <Link href="/inicio" className="flex h-12 items-center justify-center rounded-xl bg-ink font-bold text-white no-underline">
          Abrir la app
        </Link>
      </div>
    );
  }

  const shown: Platform = tab === "android" ? "android" : platform === "ios-other" ? "ios-other" : "ios-safari";
  return (
    <div className="flex flex-col gap-5">
      {inApp && (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-[15px] text-warn-ink">
          Estás dentro de Instagram o Facebook. Tocá <strong>•••</strong> (arriba a la derecha) y elegí <strong>&quot;Abrir en el navegador&quot;</strong>; desde ahí
          seguí los pasos.
        </p>
      )}
      <div role="tablist" aria-label="Tu celular" className="grid grid-cols-2 gap-2">
        {(
          [
            ["ios", "iPhone"],
            ["android", "Android"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setPicked(value)}
            className={`h-11 rounded-xl border text-[15px] font-semibold ${tab === value ? "border-ink bg-ink text-white" : "border-[#cfcfcf] bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "android" && nativePrompt && (
        <button
          type="button"
          onClick={() => nativePrompt.prompt()}
          className="flex h-12 items-center justify-center rounded-xl bg-ink font-bold text-white"
        >
          Instalar ahora
        </button>
      )}
      <InstallSteps platform={shown} />
      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <span className="text-[15px]">¿Todavía no tenés cuenta? Creala desde la app; si sos madre, padre o tutor/a, desde ahí anotás a tus hijos.</span>
        <Link href="/inicio" className="flex h-12 items-center justify-center rounded-xl border-[1.5px] border-ink font-bold text-ink no-underline">
          Ir a la app
        </Link>
      </div>
    </div>
  );
}
