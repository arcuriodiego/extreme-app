import { publicImageUrl } from "@/domain/images/images";

/** Enlace público de un flyer o foto guardada (null si no hay). */
export function imageUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? publicImageUrl(base, path) : null;
}
