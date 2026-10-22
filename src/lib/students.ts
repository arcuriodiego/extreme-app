import "server-only";
import type { StudentStatus } from "@/domain/people/student";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  dni: string | null;
  birthDate: string | null;
  phone: string | null;
  status: StudentStatus;
  joinedAt: string;
  hasAccount: boolean;
  email: string | null;
}

const SELECT = "id, first_name, last_name, dni, birth_date, phone, status, joined_at, profile_id, profile:profiles(email, phone)";

interface Raw {
  id: string;
  first_name: string;
  last_name: string;
  dni: string | null;
  birth_date: string | null;
  phone: string | null;
  status: StudentStatus;
  joined_at: string;
  profile_id: string | null;
  profile: { email: string | null; phone: string | null } | null;
}

function toRow(r: Raw): StudentRow {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    name: [r.first_name, r.last_name].filter(Boolean).join(" "),
    dni: r.dni,
    birthDate: r.birth_date,
    // Con cuenta, el teléfono lo carga la persona en su perfil.
    phone: r.profile_id ? (r.profile?.phone ?? null) : r.phone,
    status: r.status,
    joinedAt: r.joined_at,
    hasAccount: r.profile_id !== null,
    email: r.profile?.email ?? null,
  };
}

/** Busca por nombre, apellido o DNI. Devuelve hasta 100. */
export async function searchStudents(supabase: Client, q: string): Promise<{ rows: StudentRow[]; error: boolean }> {
  const safe = q.replace(/[,()%*\\.]/g, " ").trim().slice(0, 80);
  let query = supabase.from("students").select(SELECT).order("last_name").order("first_name").limit(100);
  if (safe) {
    const words = safe.split(/\s+/).filter(Boolean);
    for (const w of words) query = query.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%,dni.ilike.%${w}%`);
  }
  const { data, error } = await query;
  return { rows: ((data ?? []) as unknown as Raw[]).map(toRow), error: Boolean(error) };
}

export async function loadStudent(supabase: Client, id: string): Promise<StudentRow | null> {
  const { data } = await supabase.from("students").select(SELECT).eq("id", id).maybeSingle();
  return data ? toRow(data as unknown as Raw) : null;
}

export async function loadStudentNotes(supabase: Client, id: string): Promise<string> {
  const { data } = await supabase.from("student_notes").select("notes").eq("student_id", id).maybeSingle();
  return (data?.notes as string | undefined) ?? "";
}
