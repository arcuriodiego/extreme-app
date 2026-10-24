"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACKS = ["/admin/avisos", "/profe/avisos"];

/** Envía un aviso a todos los alumnos activos ("todos") o a un grupo. La base controla quién puede. */
export async function sendAnnouncement(formData: FormData): Promise<void> {
  const backRaw = String(formData.get("back") ?? "");
  const back = BACKS.includes(backRaw) ? backRaw : "/inicio";
  const target = String(formData.get("target") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const go = (params: Record<string, string>): never => redirect(`${back}?${new URLSearchParams(params).toString()}`);

  if (target !== "todos" && !UUID.test(target)) go({ error: "destino" });
  if (title.length === 0 || title.length > 120) go({ error: "titulo" });
  if (body.length > 1000) go({ error: "mensaje" });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_announcement", {
    p_group_id: target === "todos" ? null : target,
    p_title: title,
    p_body: body,
  });
  if (error) go({ error: error.code === "42501" ? "sin-permiso" : "generico" });
  go({ aviso: "enviado", n: String(data ?? 0) });
}
