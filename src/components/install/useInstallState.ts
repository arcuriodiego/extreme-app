"use client";

import { useEffect, useState } from "react";
import { type Platform, detectPlatform } from "@/domain/install/platform";

/** Evento de Chrome en Android para mostrar el diálogo de instalación propio. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Plataforma, si ya está instalada (abierta desde el ícono) y el aviso nativo de Android si lo hay. */
export function useInstallState(): { ready: boolean; platform: Platform; installed: boolean; nativePrompt: InstallPromptEvent | null } {
  const [state, setState] = useState<{ ready: boolean; platform: Platform; installed: boolean }>({ ready: false, platform: "desktop", installed: false });
  const [nativePrompt, setNativePrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setState({ ready: true, platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0), installed: standalone });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setNativePrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setState((s) => ({ ...s, installed: true }));
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return { ...state, nativePrompt };
}
