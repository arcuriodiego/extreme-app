"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry } from "@/domain/access/messages";
import { EntryCard } from "./EntryCard";

type Status = "off" | "starting" | "on" | "error";

/**
 * Cámara que lee códigos QR. Cada código leído se manda a `onCode`; el resultado
 * queda en pantalla unos segundos y la cámara sigue leyendo.
 */
export function Scanner({ onCode, onResult }: { onCode: (code: string) => Promise<Entry>; onResult?: (entry: Entry) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const [status, setStatus] = useState<Status>("off");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [checking, setChecking] = useState(false);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const handle = useCallback(
    async (code: string) => {
      const now = Date.now();
      const last = lastRef.current;
      if (busyRef.current || (last && last.code === code && now - last.at < 5000)) return;
      busyRef.current = true;
      lastRef.current = { code, at: now };
      setChecking(true);
      try {
        const result = await onCode(code);
        setEntry(result);
        onResult?.(result);
        if ("vibrate" in navigator) navigator.vibrate(result.result === "allowed" || result.result === "grace" ? 120 : [80, 60, 80]);
      } finally {
        setChecking(false);
        setTimeout(() => {
          busyRef.current = false;
        }, 1500);
      }
    },
    [onCode, onResult],
  );

  async function start() {
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setStatus("on");
      const canvas = canvasRef.current;
      const scan = () => {
        if (canvas && video.readyState >= 2 && video.videoWidth > 0) {
          const scale = Math.min(1, 640 / video.videoWidth);
          const w = Math.round(video.videoWidth * scale);
          const h = Math.round(video.videoHeight * scale);
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
            if (found?.data) void handle(found.data);
          }
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
    } catch {
      stop();
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-ink" style={{ aspectRatio: "4 / 3" }}>
        <video ref={videoRef} playsInline muted className={`size-full object-cover ${status === "on" ? "" : "hidden"}`} />
        <canvas ref={canvasRef} className="hidden" />
        {status === "on" && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
        )}
        {status !== "on" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            {status === "error" ? (
              <p className="text-[15px]">
                No pudimos usar la cámara. Revisá que el navegador tenga permiso para usarla y volvé a intentar.
              </p>
            ) : (
              <p className="text-[15px]">Apuntá la cámara al QR que el alumno muestra en Mis pases.</p>
            )}
            <button
              type="button"
              onClick={start}
              disabled={status === "starting"}
              className="h-11 rounded-full bg-white px-5 font-bold text-ink disabled:opacity-60"
            >
              {status === "starting" ? "Abriendo la cámara…" : "Activar cámara"}
            </button>
          </div>
        )}
        {checking && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/80 py-2 text-center text-sm font-semibold text-white">Validando…</div>
        )}
      </div>
      {entry && <EntryCard entry={entry} />}
    </div>
  );
}
