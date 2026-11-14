import "server-only";
import { randomBytes } from "node:crypto";
import { STUDENT_PHOTO_BUCKET, type ImageKind, bucketFor, checkImage, imagePath, isImagePath } from "@/domain/images/images";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const TABLES = {
  workshops: { table: "workshops", column: "image_path" },
  profes: { table: "teachers", column: "photo_path" },
  alumnos: { table: "students", column: "photo_path" },
} as const;

export type ImageResult = { ok: true } | { ok: false; error: string };

/**
 * Guarda la ruta nueva (o null) y devuelve la anterior.
 * Workshops: update directo (sólo administración, por la política).
 * Profes y alumnos: funciones de la base que dejan también al propio profe, al alumno
 * adulto, a su tutor/a o a recepción, según corresponda.
 */
async function savePath(supabase: Client, kind: ImageKind, id: string, path: string | null): Promise<{ ok: true; previous: string | null } | { ok: false; error: string }> {
  if (kind === "profes" || kind === "alumnos") {
    const fn = kind === "profes" ? "set_teacher_photo" : "set_student_photo";
    const args = kind === "profes" ? { p_teacher_id: id, p_path: path } : { p_student_id: id, p_path: path };
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, error: error.code === "42501" ? "sin-permiso" : error.code === "P0002" ? "no-disponible" : "imagen-subida" };
    return { ok: true, previous: (data as string | null) ?? null };
  }
  const { table, column } = TABLES[kind];
  const { data: row } = await supabase.from(table).select(column).eq("id", id).maybeSingle();
  const previous = (row as unknown as Record<string, string | null> | null)?.[column] ?? null;
  const { data, error } = await supabase.from(table).update({ [column]: path }).eq("id", id).select("id");
  if (error) return { ok: false, error: "imagen-subida" };
  if (!data || data.length === 0) return { ok: false, error: "sin-permiso" };
  return { ok: true, previous };
}

/** Sube la imagen nueva, la guarda (workshop, profe o alumno) y borra la anterior. */
export async function replaceImage(supabase: Client, kind: ImageKind, id: string, entry: FormDataEntryValue | null): Promise<ImageResult> {
  const file = entry instanceof File ? entry : null;
  const checked = checkImage(file);
  if (!checked.ok) return checked;
  const { table } = TABLES[kind];

  const { data: row } = await supabase.from(table).select("academy_id").eq("id", id).maybeSingle();
  const academyId = (row as { academy_id: string } | null)?.academy_id;
  if (!academyId) return { ok: false, error: "no-disponible" };

  const path = imagePath(academyId, kind, id, randomBytes(12).toString("base64url"), checked.type);
  const storage = supabase.storage.from(bucketFor(kind));
  const uploaded = await storage.upload(path, file!, {
    contentType: checked.type,
    cacheControl: kind === "alumnos" ? "3600" : "31536000",
    upsert: false,
  });
  if (uploaded.error) {
    const status = Number((uploaded.error as { statusCode?: string | number }).statusCode ?? 0);
    return { ok: false, error: status === 403 || status === 400 ? "sin-permiso" : status === 413 ? "imagen-pesada" : "imagen-subida" };
  }

  const saved = await savePath(supabase, kind, id, path);
  if (!saved.ok) {
    await storage.remove([path]);
    return saved;
  }
  if (saved.previous && isImagePath(saved.previous)) await storage.remove([saved.previous]);
  return { ok: true };
}

/** Quita la imagen y borra el archivo. */
export async function removeImage(supabase: Client, kind: ImageKind, id: string): Promise<ImageResult> {
  const saved = await savePath(supabase, kind, id, null);
  if (!saved.ok) return saved.error === "imagen-subida" ? { ok: false, error: "generico" } : saved;
  if (saved.previous && isImagePath(saved.previous)) await supabase.storage.from(bucketFor(kind)).remove([saved.previous]);
  return { ok: true };
}

/**
 * Enlaces firmados (1 hora) para fotos de alumnos: el bucket es privado y sólo
 * firma quien puede verlas (personal, el alumno y sus tutores).
 */
export async function studentPhotoUrls(supabase: Client, paths: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const valid = [...new Set(paths.filter((p): p is string => !!p && isImagePath(p, "alumnos")))];
  const map = new Map<string, string>();
  if (valid.length === 0) return map;
  const { data } = await supabase.storage.from(STUDENT_PHOTO_BUCKET).createSignedUrls(valid, 3600);
  for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  return map;
}

export async function studentPhotoUrl(supabase: Client, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  return (await studentPhotoUrls(supabase, [path])).get(path) ?? null;
}

