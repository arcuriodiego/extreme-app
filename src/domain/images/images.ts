/**
 * Imágenes de la academia: flyers de workshops y fotos de profes.
 * Se guardan en el bucket público "imagenes" de Supabase Storage, con la ruta
 *   <academia>/<workshops|profes>/<id>/<nombre al azar>.<jpg|png|webp>
 * La base controla que la ruta sea de la misma academia y del mismo workshop o profe.
 */

export const IMAGE_BUCKET = "imagenes";

export type ImageKind = "workshops" | "profes";

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
export const MAX_SIDE: Record<ImageKind, number> = { workshops: 1600, profes: 600 };

export type ImageCheck = { ok: true; type: ImageType } | { ok: false; error: "imagen-vacia" | "imagen-tipo" | "imagen-pesada" };

export function checkImage(file: { size: number; type: string } | null | undefined): ImageCheck {
  if (!file || file.size === 0) return { ok: false, error: "imagen-vacia" };
  if (!(file.type in IMAGE_TYPES)) return { ok: false, error: "imagen-tipo" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "imagen-pesada" };
  return { ok: true, type: file.type as ImageType };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/(workshops|profes)/(${UUID})/[A-Za-z0-9_-]{8,40}\\.(jpg|png|webp)$`);

export function imagePath(academyId: string, kind: ImageKind, ownerId: string, token: string, type: ImageType): string {
  return `${academyId}/${kind}/${ownerId}/${token}.${IMAGE_TYPES[type]}`;
}

export function isImagePath(path: string, kind?: ImageKind): boolean {
  const m = PATH.exec(path);
  return !!m && (kind === undefined || m[2] === kind);
}

/** Dirección pública de la imagen (el bucket es público: la ven todos los que tienen el enlace). */
export function publicImageUrl(supabaseUrl: string, path: string | null | undefined): string | null {
  if (!path || !isImagePath(path)) return null;
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
