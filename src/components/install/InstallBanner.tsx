"use client";

import { useState } from "react";
import { snoozed } from "@/domain/install/platform";
import { InstallSteps } from "./InstallSteps";
import { useBrowserValue, useInstallState } from "./useInstallState";

const KEY = "instalar-ahora-no";

/**
 * Aviso para instalar la app (va arriba del área personal). Sólo en el celular,
 * cuando se abrió desde el navegador y no desde el ícono. "Ahora no" lo oculta 7 días.
 */
export function InstallBanner() {
  const { ready, platform, installed, nativePrompt } = useInstallState();
  // ¿Tocó "Ahora no" hace menos de 7 días? (se lee en el navegador; en el servidor, oculto)
  const snoozedNow = useBrowserValue(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      return snoozed(v ? Number(v) : null, Date.now());
    } catch {
      return false;
    }
  }, true);
  const [dismissedNow, setDismissedNow] = useState(false);
  const [open, setOpen] = useState(false);
  const hidden = dismissedNow || snoozedNow;

  if (!ready || installed || hidden || platform === "desktop") return null;

  function later() {
    try {
      window.localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Sin almacenamiento (modo privado): se oculta sólo por ahora.
    }
    setDismissedNow(true);
  }

  async function installNow() {
    if (!nativePrompt) {
      setOpen(true);
      return;
    }
    await nativePrompt.prompt();
    const choice = await nativePrompt.userChoice;
    if (choice.outcome === "accepted") setDismissedNow(true);
  }

  return (
    <section aria-label="Instalar la app" className="mx-5 mt-3 flex flex-col gap-3 rounded-[var(--radius-card)] border-[1.5px] border-ink bg-white p-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">Instalá la app en tu celular</span>
        <span className="text-sm text-muted">Queda con su ícono en la pantalla de inicio y se abre directo, sin buscarla en el navegador.</span>
      </div>
      {open && <InstallSteps platform={platform} />}
      <div className="flex flex-wrap gap-2">
        {platform === "android" && nativePrompt ? (
          <button type="button" onClick={installNow} className="h-9 rounded-full border border-ink bg-ink px-3.5 text-sm font-semibold text-white">
            Instalar
          </button>
        ) : (
          !open && (
            <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-full border border-ink bg-ink px-3.5 text-sm font-semibold text-white">
              Ver cómo
            </button>
          )
        )}
        <button type="button" onClick={later} className="h-9 rounded-full border border-[#cfcfcf] bg-white px-3.5 text-sm font-semibold">
          Ahora no
        </button>
      </div>
    </section>
  );
}
