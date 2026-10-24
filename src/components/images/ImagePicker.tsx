"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { MAX_SIDE, type ImageKind, fitWithin } from "@/domain/images/images";

/**
 * Elegir una imagen (de la galería o la cámara del celular) y subirla.
 * Antes de enviarla la achica en el mismo dispositivo: sube rápido aunque la foto
 * original sea enorme, y se ve igual de bien en la app.
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

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    if (!original) {
      setPreview(null);
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
      {shown && (
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
          className="text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-full file:border file:border-[#cfcfcf] file:bg-white file:px-3.5 file:text-sm file:font-semibold"
        />
        <span className="text-sm text-muted">JPG, PNG o WEBP. Si es muy grande, la achicamos antes de subirla.</span>
      </label>
      {preview && <Submit busy={busy}>{submitLabel}</Submit>}
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
      className="h-9 self-start rounded-full border border-ink bg-ink px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#333] disabled:opacity-60"
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
