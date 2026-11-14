"use server";

import { type Entry, toEntry } from "@/domain/access/messages";
import { studentPhotoUrl } from "@/lib/images";
import { searchStudents } from "@/lib/students";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failed(message: string | undefined): Entry {
  const reason = message?.startsWith("No tenés permiso") ? "sin-permiso" : "error";
  return { result: "invalid", reason, studentId: null, studentName: null, label: null, startsAt: null, already: false };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Suma la foto del alumno al resultado (si tiene y quien escanea puede verla). */
async function withPhoto(supabase: Client, entry: Entry): Promise<Entry> {
  if (!entry.studentId) return entry;
  const { data } = await supabase.from("students").select("photo_path").eq("id", entry.studentId).maybeSingle();
  const path = (data as { photo_path: string | null } | null)?.photo_path ?? null;
  return { ...entry, photoUrl: await studentPhotoUrl(supabase, path).catch(() => null) };
}

/** Recepción o el profe escanean un QR: la base valida y registra el ingreso. */
export async function scanAccessCode(code: string): Promise<Entry> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in", { p_code: String(code ?? "").slice(0, 200) });
  if (error) return failed(error.message);
  return withPhoto(supabase, toEntry(data));
}

/** Recepción registra el ingreso a mano, buscando al alumno. */
export async function checkInStudentById(studentId: string): Promise<Entry> {
  if (!UUID.test(studentId)) return failed(undefined);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_student", { p_student_id: studentId });
  if (error) return failed(error.message);
  return withPhoto(supabase, toEntry(data));
}

export interface FoundStudent {
  id: string;
  name: string;
  dni: string | null;
}

export async function findStudents(q: string): Promise<FoundStudent[]> {
  const text = String(q ?? "").trim();
  if (text.length < 2) return [];
  const supabase = await createClient();
  const { rows } = await searchStudents(supabase, text);
  return rows.filter((r) => r.status !== "inactive").slice(0, 8).map((r) => ({ id: r.id, name: r.name, dni: r.dni }));
}
