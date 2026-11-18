"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { MAX_SIDE, SQUARE_KINDS, type ImageKind, type Offset, clampOffset, coverScale, cropSquare, fitWithin } from "@/domain/images/images";

/**
 * Elegir una imagen (de la galería o la cámara del celular) y subirla.
 * Antes de enviarla la achica en el mismo dispositivo: sube rápido aunque la foto
 * original sea enorme, y se ve igual de bien en la app.
 * Las fotos redondas (profes y alumnos) se encuadran: se arrastra para moverla y
 * se agranda con la barra; se sube sólo lo que queda dentro del círculo.
 */
export function ImagePicker({
  kind,
  label,
  submitLabel,
  current,
}: {
  kind: ImageKind;
  label: string;
  submitLabel: string;
  current?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const square = SQUARE_KINDS.includes(kind);
  const [picked, setPicked] = useState<{ img: HTMLImageElement; name: string } | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.img.src);
  }, [picked]);

  // Cada vez que cambia el encuadre, se arma el archivo recortado que va a subir.
  const onCrop = useCallback(
    async (crop: { x: number; y: number; size: number }) => {
      if (!picked || !inputRef.current) return;
      const side = Math.max(1, Math.round(Math.min(MAX_SIDE[kind], crop.size)));
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, side, side);
      ctx.drawImage(picked.img, crop.x, crop.y, crop.size, crop.size, 0, 0, side, side);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
      if (!blob || !inputRef.current) return;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], `${picked.name}.jpg`, { type: "image/jpeg" }));
      inputRef.current.files = dt.files;
      setReady(true);
    },
    [picked, kind],
  );

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    if (!original) {
      setPreview(null);
      setPicked(null);
      return;
    }
    if (square) {
      setReady(false);
      try {
        const url = URL.createObjectURL(original);
        const img = new Image();
        img.src = url;
        await img.decode();
        setPicked({ img, name: original.name.replace(/\.[^.]+$/, "") || "foto" });
      } catch {
        setPicked(null);
        setPreview(URL.createObjectURL(original));
      }
      return;
    }
    setBusy(true);
    try {
      const smaller = await shrink(original, MAX_SIDE[kind]);
      if (smaller && inputRef.current) {
        const dt = new DataTransfer();
        dt.items.add(smaller);
        inputRef.current.files = dt.files;
      }
      setPreview(URL.createObjectURL(smaller ?? original));
    } catch {
      setPreview(URL.createObjectURL(original));
    } finally {
      setBusy(false);
    }
  }

  const round = kind === "profes";
  const shown = preview ?? current ?? null;
  return (
    <div className="flex flex-col gap-3">
      {picked ? (
        <Cropper key={picked.img.src} img={picked.img} round={round} onCrop={onCrop} />
      ) : shown && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shown}
          alt={preview ? "Vista previa" : "Imagen actual"}
          className={round ? "h-24 w-24 rounded-full object-cover" : "max-h-80 w-auto max-w-full self-start rounded-xl border border-line"}
        />
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold">{label}</span>
        <input
          ref={inputRef}
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={onChange}
          className="text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-full file:border file:border-edge file:bg-paper file:px-3.5 file:text-sm file:font-semibold"
        />
        <span className="text-sm text-muted">
          JPG, PNG o WEBP. {square ? "Después podés moverla y agrandarla para centrarla." : "Si es muy grande, la achicamos antes de subirla."}
        </span>
      </label>
      {picked ? <Submit busy={!ready}>{submitLabel}</Submit> : preview && <Submit busy={busy}>{submitLabel}</Submit>}
    </div>
  );
}

const FRAME = 240;
const MAX_ZOOM = 4;

/** Marco para encuadrar: arrastrar mueve la foto; la barra (o la rueda del mouse) la agranda. */
function Cropper({ img, round, onCrop }: { img: HTMLImageElement; round: boolean; onCrop: (crop: { x: number; y: number; size: number }) => void }) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; start: Offset } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // Avisa el recorte un ratito después del último cambio (no en cada píxel).
  useEffect(() => {
    const t = setTimeout(() => onCrop(cropSquare(w, h, FRAME, zoom, offset)), 150);
    return () => clearTimeout(t);
  }, [w, h, zoom, offset, onCrop]);

  const applyZoom = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    setOffset((o) => clampOffset(w, h, FRAME, next, o));
  };

  // Rueda del mouse: agrandar o achicar sin que se mueva la página.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const next = Math.min(MAX_ZOOM, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
        setOffset((o) => clampOffset(w, h, FRAME, next, o));
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [w, h]);

  const s = coverScale(w, h, FRAME, zoom);
  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frameRef}
        role="img"
        aria-label="Encuadre de la foto: arrastrá para moverla"
        className={`relative cursor-grab touch-none select-none overflow-hidden bg-surface active:cursor-grabbing ${round ? "rounded-full" : "rounded-xl"}`}
        style={{ width: FRAME, height: FRAME }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: offset };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          setOffset(clampOffset(w, h, FRAME, zoom, { x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
          style={{ width: w * s, height: h * s, transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)` }}
        />
      </div>
      <label className="flex items-center gap-3 text-sm" style={{ width: FRAME }}>
        <span className="text-muted">Tamaño</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => applyZoom(Number(e.target.value))}
          className="w-full accent-[var(--color-ink)]"
          aria-label="Agrandar la foto"
        />
      </label>
      <p className="text-sm text-muted">Arrastrá la foto para centrarla y usá la barra para agrandarla. Se sube lo que se ve en el círculo.</p>
    </div>
  );
}

function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={busy || pending}
      aria-busy={busy || pending}
      className="h-9 self-start rounded-full border border-ink bg-ink px-3.5 text-sm font-semibold text-paper transition-colors hover:bg-ink-soft disabled:opacity-60"
    >
      {pending ? "Subiendo…" : children}
    </button>
  );
}

/** Achica a JPEG con el lado más largo en `max`. Devuelve null si no hace falta. */
async function shrink(file: File, max: number): Promise<File | null> {
  const bitmap = await loadImage(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  if (width === bitmap.width && file.size <= 600 * 1024 && file.type !== "image/png") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap.source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return null;
  const name = file.name.replace(/\.[^.]+$/, "") || "imagen";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}

async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    // Se libera después de dibujar: el navegador ya decodificó la imagen.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
