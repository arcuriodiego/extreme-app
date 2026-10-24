import "server-only";
import { randomBytes } from "node:crypto";
import { IMAGE_BUCKET, type ImageKind, checkImage, imagePath, isImagePath } from "@/domain/images/images";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const TARGETS = {
  workshops: { table: "workshops", column: "image_path" },
  profes: { table: "teachers", column: "photo_path" },
} as const;

export type ImageResult = { ok: true } | { ok: false; error: string };

/**
 * Sube la imagen nueva, la guarda en el workshop o profe y borra la anterior.
 * Permisos: los controla la base (sólo administración sube y guarda).
 */
export async function replaceImage(supabase: Client, kind: ImageKind, id: string, entry: FormDataEntryValue | null): Promise<ImageResult> {
  const file = entry instanceof File ? entry : null;
  const checked = checkImage(file);
  if (!checked.ok) return checked;
  const { table, column } = TARGETS[kind];

  const { data: row } = await supabase.from(table).select(`academy_id, ${column}`).eq("id", id).maybeSingle();
  const current = row as unknown as { academy_id: string; image_path?: string | null; photo_path?: string | null } | null;
  if (!current) return { ok: false, error: "no-disponible" };

  const path = imagePath(current.academy_id, kind, id, randomBytes(12).toString("base64url"), checked.type);
  const storage = supabase.storage.from(IMAGE_BUCKET);
  const uploaded = await storage.upload(path, file!, { contentType: checked.type, cacheControl: "31536000", upsert: false });
  if (uploaded.error) {
    const status = Number((uploaded.error as { statusCode?: string | number }).statusCode ?? 0);
    return { ok: false, error: status === 403 ? "sin-permiso" : status === 413 ? "imagen-pesada" : "imagen-subida" };
  }

  const { data, error } = await supabase.from(table).update({ [column]: path }).eq("id", id).select("id");
  if (error || !data || data.length === 0) {
    await storage.remove([path]);
    return { ok: false, error: error ? "imagen-subida" : "sin-permiso" };
  }

  const previous = current[column];
  if (previous && isImagePath(previous)) await storage.remove([previous]);
  return { ok: true };
}

/** Quita la imagen del workshop o profe y borra el archivo. */
export async function removeImage(supabase: Client, kind: ImageKind, id: string): Promise<ImageResult> {
  const { table, column } = TARGETS[kind];
  const { data: row } = await supabase.from(table).select(column).eq("id", id).maybeSingle();
  const previous = (row as unknown as Record<string, string | null> | null)?.[column] ?? null;
  const { data, error } = await supabase.from(table).update({ [column]: null }).eq("id", id).select("id");
  if (error) return { ok: false, error: "generico" };
  if (!data || data.length === 0) return { ok: false, error: "sin-permiso" };
  if (previous && isImagePath(previous)) await supabase.storage.from(IMAGE_BUCKET).remove([previous]);
  return { ok: true };
}
