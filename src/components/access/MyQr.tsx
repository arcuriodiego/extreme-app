"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { accessCode, msUntilNextWindow, qrWindow } from "@/domain/access/qr";

/**
 * Pase QR del alumno. Se arma en el celular y cambia cada 30 segundos.
 * `serverNow` corrige la hora si el reloj del celular está desfasado.
 */
export function MyQr({ studentId, secret, serverNow, name }: { studentId: string; secret: string; serverNow: number; name: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const skew = serverNow - Date.now();
    let cancelled = false;
    let lastWindow = -1;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      const now = Date.now() + skew;
      try {
        if (qrWindow(now) !== lastWindow) {
          lastWindow = qrWindow(now);
          const code = await accessCode(secret, studentId, now);
          const image = await QRCode.toString(code, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
          if (!cancelled) setSvg(image);
        }
        if (!cancelled) setSecondsLeft(Math.ceil(msUntilNextWindow(now) / 1000));
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (!cancelled) timer = setTimeout(tick, 1000);
    }

    timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [studentId, secret, serverNow]);

  if (failed) {
    return (
      <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">
        Este navegador no puede mostrar el pase. Actualizá la app o pedí en recepción que registren tu ingreso.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line p-5">
      <div
        className="aspect-square w-full max-w-[280px] bg-white [&>svg]:size-full"
        role="img"
        aria-label={`Pase QR de ${name}`}
        // El SVG lo genera la librería a partir de nuestro propio código.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <span className="text-lg font-bold">{name}</span>
      <span className="text-sm text-muted" aria-live="off">
        {secondsLeft === null ? "Generando tu pase…" : `El código cambia en ${secondsLeft} s. Las capturas de pantalla no sirven.`}
      </span>
    </div>
  );
}
