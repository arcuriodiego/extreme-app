/**
 * Imágenes de la academia: flyers de workshops y fotos de profes.
 * Se guardan en el bucket público "imagenes" de Supabase Storage, con la ruta
 *   <academia>/<workshops|profes>/<id>/<nombre al azar>.<jpg|png|webp>
 * La base controla que la ruta sea de la misma academia y del mismo workshop o profe.
 */

export const IMAGE_BUCKET = "imagenes";

export type ImageKind = "workshops" | "profes" | "alumnos";

/** Fotos de alumnos: bucket privado (sólo uso interno; se ven con enlaces firmados). */
export const STUDENT_PHOTO_BUCKET = "fotos";

export function bucketFor(kind: ImageKind): string {
  return kind === "alumnos" ? STUDENT_PHOTO_BUCKET : IMAGE_BUCKET;
}

/** Tipos aceptados (el celular convierte las fotos HEIC del iPhone a JPEG al elegirlas). */
export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

/** Tamaño máximo que se sube. La app achica la imagen antes de enviarla, así que casi siempre queda muy por debajo. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Lado más largo al achicar en el celular o la PC, en píxeles. */
export const MAX_SIDE: Record<ImageKind, number> = { workshops: 1600, profes: 600, alumnos: 600 };

export type ImageCheck = { ok: true; type: ImageType } | { ok: false; error: "imagen-vacia" | "imagen-tipo" | "imagen-pesada" };

export function checkImage(file: { size: number; type: string } | null | undefined): ImageCheck {
  if (!file || file.size === 0) return { ok: false, error: "imagen-vacia" };
  if (!(file.type in IMAGE_TYPES)) return { ok: false, error: "imagen-tipo" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "imagen-pesada" };
  return { ok: true, type: file.type as ImageType };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/(workshops|profes|alumnos)/(${UUID})/[A-Za-z0-9_-]{8,40}\\.(jpg|png|webp)$`);

export function imagePath(academyId: string, kind: ImageKind, ownerId: string, token: string, type: ImageType): string {
  return `${academyId}/${kind}/${ownerId}/${token}.${IMAGE_TYPES[type]}`;
}

export function isImagePath(path: string, kind?: ImageKind): boolean {
  const m = PATH.exec(path);
  return !!m && (kind === undefined || m[2] === kind);
}

/** Dirección pública de la imagen (el bucket es público: la ven todos los que tienen el enlace). */
export function publicImageUrl(supabaseUrl: string, path: string | null | undefined): string | null {
  if (!path || !isImagePath(path) || isImagePath(path, "alumnos")) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`;
}

/** Medidas al achicar: el lado más largo queda en `max`, sin agrandar nunca. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest === 0) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Iniciales para cuando el profe todavía no tiene foto. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase("es-AR"))
    .join("");
}

/** Mensajes para quien sube la imagen. */
export const IMAGE_ERRORS: Record<string, string> = {
  "imagen-vacia": "Elegí una imagen.",
  "imagen-tipo": "La imagen tiene que ser JPG, PNG o WEBP.",
  "imagen-pesada": "La imagen pesa demasiado (hasta 3 MB). Probá con otra o sacale una captura.",
  "imagen-subida": "No pudimos subir la imagen. Probá de nuevo.",
};

/** Documentos (bucket privado "documentos"): PDF o imágenes de hasta 4 MB (Vercel no recibe envíos de más de 4,5 MB). */
export const DOCUMENT_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export function checkDocument(file: { size: number; type: string } | null | undefined):
  | { ok: true; type: DocumentType }
  | { ok: false; error: "archivo-vacio" | "archivo-tipo" | "archivo-pesado" } {
  if (!file || file.size === 0) return { ok: false, error: "archivo-vacio" };
  if (!(file.type in DOCUMENT_TYPES)) return { ok: false, error: "archivo-tipo" };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "archivo-pesado" };
  return { ok: true, type: file.type as DocumentType };
}

// ---------------------------------------------------------------------
// Encuadre de fotos redondas (profes y alumnos): el usuario mueve y agranda
// la foto dentro de un marco cuadrado; se sube sólo lo que queda adentro.
// ---------------------------------------------------------------------

/** Fotos que se muestran en un círculo y se encuadran antes de subir. */
export const SQUARE_KINDS: readonly ImageKind[] = ["profes", "alumnos"];

export type Offset = { x: number; y: number };

/** Escala con la que la foto (w×h) cubre justo un marco de lado `frame`, por el zoom. */
export function coverScale(width: number, height: number, frame: number, zoom: number): number {
  return (frame / Math.min(width, height)) * zoom;
}

/** Corrimiento (centro de la foto respecto del centro del marco) limitado para que la foto siempre cubra el marco. */
export function clampOffset(width: number, height: number, frame: number, zoom: number, offset: Offset): Offset {
  const s = coverScale(width, height, frame, zoom);
  const maxX = Math.max(0, (width * s - frame) / 2);
  const maxY = Math.max(0, (height * s - frame) / 2);
  const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, v)) || 0;
  return { x: clamp(offset.x, maxX), y: clamp(offset.y, maxY) };
}

/** Cuadrado de la foto original (en sus píxeles) que se ve dentro del marco. */
export function cropSquare(
  width: number,
  height: number,
  frame: number,
  zoom: number,
  offset: Offset,
): { x: number; y: number; size: number } {
  const o = clampOffset(width, height, frame, zoom, offset);
  const s = coverScale(width, height, frame, zoom);
  const size = Math.min(frame / s, width, height);
  const x = Math.min(width - size, Math.max(0, width / 2 - o.x / s - size / 2));
  const y = Math.min(height - size, Math.max(0, height / 2 - o.y / s - size / 2));
  return { x, y, size };
}
