"use server";

import { redirect } from "next/navigation";
import { removeImage, replaceImage } from "@/lib/images";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function to(params: Record<string, string>): never {
  redirect(`/perfil?${new URLSearchParams(params).toString()}#fotos`);
}

async function myTeacherId(): Promise<string | null> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("teachers").select("id").eq("profile_id", profile.id).eq("active", true).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** El profe sube su propia foto (la que ven los alumnos en la grilla). */
export async function setMyTeacherPhoto(formData: FormData): Promise<void> {
  const id = await myTeacherId();
  if (!id) to({ error: "sin-permiso" });
  const result = await replaceImage(await createClient(), "profes", id, formData.get("image"));
  if (!result.ok) to({ error: result.error });
  to({ aviso: "foto-profe" });
}

export async function removeMyTeacherPhoto(): Promise<void> {
  const id = await myTeacherId();
  if (!id) to({ error: "sin-permiso" });
  const result = await removeImage(await createClient(), "profes", id);
  if (!result.ok) to({ error: result.error });
  to({ aviso: "foto-quitada" });
}

/** Foto del alumno para recepción: el adulto la suya; el tutor/a, la de sus hijos. La base controla quién puede. */
export async function setStudentPhoto(formData: FormData): Promise<void> {
  const id = String(formData.get("student_id") ?? "");
  if (!UUID.test(id)) to({ error: "datos" });
  const result = await replaceImage(await createClient(), "alumnos", id, formData.get("image"));
  if (!result.ok) to({ error: result.error });
  to({ aviso: "foto-alumno" });
}

export async function removeStudentPhoto(formData: FormData): Promise<void> {
  const id = String(formData.get("student_id") ?? "");
  if (!UUID.test(id)) to({ error: "datos" });
  const result = await removeImage(await createClient(), "alumnos", id);
  if (!result.ok) to({ error: result.error });
  to({ aviso: "foto-quitada" });
}
