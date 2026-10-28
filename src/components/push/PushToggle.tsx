"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { base64UrlToBytes, bytesToBase64Url } from "@/domain/push/push";
import { detectPlatform } from "@/domain/install/platform";
import { deletePushSubscription, savePushSubscription, testPush } from "./actions";

type Status = "checking" | "unsupported" | "needs-install" | "off" | "on" | "denied" | "working";

const noSubscribe = () => () => {};

function supportInfo(): "ok" | "unsupported" | "needs-install" {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  // En iPhone, las notificaciones sólo existen con la app instalada en la pantalla de inicio.
  if ((platform === "ios-safari" || platform === "ios-other") && !standalone) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

/** Activar o desactivar las notificaciones en este celular (o computadora). */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const support = useSyncExternalStore(noSubscribe, supportInfo, () => "ok" as const);
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (support !== "ok" || !publicKey) return;
    let cancelled = false;
    (async () => {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (cancelled) return;
      if (sub) {
        // Por si cambió de cuenta en este celular: la suscripción queda con quien inició sesión.
        const json = sub.toJSON();
        await savePushSubscription({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", userAgent: navigator.userAgent });
      }
      if (!cancelled) setStatus(Notification.permission === "denied" ? "denied" : sub ? "on" : "off");
    })().catch(() => !cancelled && setStatus("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [support, publicKey]);

  if (!publicKey) return null;
  const shown: Status = support === "ok" ? status : support;

  async function enable() {
    setMessage(null);
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey!) as BufferSource }));
      const raw = sub.getKey("p256dh");
      const auth = sub.getKey("auth");
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: raw ? bytesToBase64Url(raw) : "",
        auth: auth ? bytesToBase64Url(auth) : "",
        userAgent: navigator.userAgent,
      });
      setStatus(res.ok ? "on" : "off");
      if (!res.ok) setMessage("No pudimos activarlas. Probá de nuevo.");
    } catch {
      setStatus("off");
      setMessage("No pudimos activarlas en este celular. Probá de nuevo.");
    }
  }

  async function disable() {
    setMessage(null);
    setStatus("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setStatus("off");
    }
  }

  async function test() {
    setMessage(null);
    const res = await testPush();
    setMessage(res && res.sent > 0 ? "Te mandamos una notificación de prueba." : "No pudimos mandarla. Desactivalas y activalas de nuevo.");
  }

  const button = "h-9 rounded-full px-3.5 text-sm font-semibold";
  return (
    <section aria-label="Notificaciones" className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line p-4">
      <span className="font-semibold">Notificaciones en este celular</span>
      {shown === "checking" && <span className="text-sm text-muted">Revisando…</span>}
      {shown === "needs-install" && (
        <span className="text-sm text-muted">
          En iPhone llegan sólo con la app instalada en la pantalla de inicio. <Link href="/instalar">Instalala</Link> y abrila desde el ícono para activarlas.
        </span>
      )}
      {shown === "unsupported" && <span className="text-sm text-muted">Este navegador no permite notificaciones. Probá desde Chrome (Android) o con la app instalada.</span>}
      {shown === "denied" && (
        <span className="text-sm text-muted">
          Están bloqueadas. Para activarlas, entrá a los ajustes del celular → Notificaciones → Extreme Dance (o los ajustes del navegador) y permitilas.
        </span>
      )}
      {(shown === "off" || shown === "working") && status !== "on" && (
        <>
          <span className="text-sm text-muted">Te avisamos al instante: vencimiento de la cuota, clases suspendidas, lugares liberados y avisos de la academia.</span>
          <div>
            <button type="button" disabled={shown === "working"} onClick={enable} className={`${button} border border-ink bg-ink text-white disabled:opacity-60`}>
              {shown === "working" ? "Activando…" : "Activar notificaciones"}
            </button>
          </div>
        </>
      )}
      {shown === "on" && (
        <>
          <span className="text-sm font-semibold text-ok-ink">Activadas ✓</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={test} className={`${button} border border-[#cfcfcf] bg-white`}>
              Mandarme una de prueba
            </button>
            <button type="button" onClick={disable} className={`${button} border border-[#cfcfcf] bg-white`}>
              Desactivar
            </button>
          </div>
        </>
      )}
      {message && <span className="text-sm">{message}</span>}
    </section>
  );
}
