"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { type Platform, detectPlatform } from "@/domain/install/platform";

/** Evento de Chrome en Android para mostrar el diálogo de instalación propio. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const noSubscribe = () => () => {};

/** Un dato que sólo existe en el navegador (en el servidor vale `server`). */
export function useBrowserValue<T extends string | number | boolean | null>(get: () => T, server: T): T {
  return useSyncExternalStore(noSubscribe, get, () => server);
}

function subscribeStandalone(onChange: () => void) {
  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener?.("change", onChange);
  return () => mq?.removeEventListener?.("change", onChange);
}

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Plataforma, si ya está instalada (abierta desde el ícono) y el aviso nativo de Android si lo hay. */
export function useInstallState(): { ready: boolean; platform: Platform; installed: boolean; nativePrompt: InstallPromptEvent | null } {
  const ready = useBrowserValue(() => true, false);
  const platform = useBrowserValue<Platform>(() => detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0), "desktop");
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const [justInstalled, setJustInstalled] = useState(false);
  const [nativePrompt, setNativePrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setNativePrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setJustInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return { ready, platform, installed: standalone || justInstalled, nativePrompt };
}
