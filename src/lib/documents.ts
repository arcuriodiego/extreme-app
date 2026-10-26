import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export const DOCUMENT_BUCKET = "documentos";

export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  mimeType: string;
  sizeBytes: number;
  audience: "all" | "staff";
  createdAt: string;
  filePath: string;
  /** Enlace temporal para abrirlo (vence en 1 hora). */
  url: string | null;
}

export async function loadDocuments(supabase: Client): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, description, mime_type, size_bytes, audience, created_at, file_path")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los documentos: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    title: string;
    description: string | null;
    mime_type: string;
    size_bytes: number;
    audience: "all" | "staff";
    created_at: string;
    file_path: string;
  }[];
  const urls = new Map<string, string>();
  if (rows.length > 0) {
    const { data: signed } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrls(
      rows.map((r) => r.file_path),
      3600,
    );
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    audience: r.audience,
    createdAt: r.created_at,
    filePath: r.file_path,
    url: urls.get(r.file_path) ?? null,
  }));
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
