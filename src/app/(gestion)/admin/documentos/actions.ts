"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { DOCUMENT_TYPES, checkDocument } from "@/domain/images/images";
import { DOCUMENT_BUCKET } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";

const BACK = "/admin/documentos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function to(params: Record<string, string>): never {
  redirect(`${BACK}?${new URLSearchParams(params).toString()}`);
}
const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};

export async function publishRegulation(formData: FormData): Promise<void> {
  const title = str(formData, "title");
  const body = str(formData, "body").replace(/\r\n/g, "\n");
  if (!title || title.length > 120) to({ error: "reglamento-titulo" });
  if (!body || body.length > 30000) to({ error: "reglamento-texto" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_regulation", { p_title: title, p_body: body });
  if (error) to({ error: error.code === "42501" ? "sin-permiso" : "generico" });
  to({ aviso: "reglamento-publicado" });
}

export async function uploadDocument(formData: FormData): Promise<void> {
  const title = str(formData, "title").replace(/\s+/g, " ");
  const description = str(formData, "description").slice(0, 300) || null;
  const audience = str(formData, "audience") === "staff" ? "staff" : "all";
  if (!title || title.length > 120) to({ error: "documento-titulo" });
  const entry = formData.get("file");
  const file = entry instanceof File ? entry : null;
  const checked = checkDocument(file);
  if (!checked.ok) to({ error: checked.error });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  const { data: profile } = me ? await supabase.from("profiles").select("academy_id").eq("id", me).maybeSingle() : { data: null };
  const academyId = (profile as { academy_id: string } | null)?.academy_id;
  if (!academyId) to({ error: "sin-permiso" });

  const path = `${academyId}/documentos/${randomUUID()}.${DOCUMENT_TYPES[checked.type]}`;
  const storage = supabase.storage.from(DOCUMENT_BUCKET);
  const up = await storage.upload(path, file!, { contentType: checked.type, upsert: false });
  if (up.error) {
    const status = Number((up.error as { statusCode?: string | number }).statusCode ?? 0);
    to({ error: status === 403 ? "sin-permiso" : status === 413 ? "archivo-pesado" : "archivo-subida" });
  }
  const { error } = await supabase
    .from("documents")
    .insert({ title, description, file_path: path, mime_type: checked.type, size_bytes: file!.size, audience });
  if (error) {
    await storage.remove([path]);
    to({ error: error.code === "42501" ? "sin-permiso" : "generico" });
  }
  to({ aviso: "documento-subido" });
}

export async function removeDocument(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  if (!UUID.test(id)) to({ error: "datos" });
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").delete().eq("id", id).select("file_path");
  if (error) to({ error: "generico" });
  const row = (data ?? [])[0] as { file_path: string } | undefined;
  if (!row) to({ error: "sin-permiso" });
  await supabase.storage.from(DOCUMENT_BUCKET).remove([row.file_path]);
  to({ aviso: "documento-quitado" });
}
