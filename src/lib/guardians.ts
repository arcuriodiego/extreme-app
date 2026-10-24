import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type Relationship = "madre" | "padre" | "tutor";

export const RELATIONSHIP_LABELS: Record<Relationship, string> = { madre: "Madre", padre: "Padre", tutor: "Tutor/a" };

export interface GuardianLink {
  id: string;
  name: string;
  email: string | null;
  relationship: Relationship | null;
  isPrimary: boolean;
  canBook: boolean;
}

interface RawLink {
  id: string;
  relationship: Relationship | null;
  is_primary: boolean;
  can_book: boolean;
  guardian: { profile: { first_name: string | null; last_name: string | null; email: string | null } | null } | null;
}

/** Tutores de un alumno. */
export async function loadGuardians(supabase: Client, studentId: string): Promise<GuardianLink[]> {
  const { data } = await supabase
    .from("guardian_students")
    .select("id, relationship, is_primary, can_book, guardian:guardians(profile:profiles(first_name, last_name, email))")
    .eq("student_id", studentId)
    .order("created_at");
  return ((data ?? []) as unknown as RawLink[]).map((r) => {
    const p = r.guardian?.profile;
    return {
      id: r.id,
      name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || (p?.email ?? "Sin nombre"),
      email: p?.email ?? null,
      relationship: r.relationship,
      isPrimary: r.is_primary,
      canBook: r.can_book,
    };
  });
}

export interface Ward {
  linkId: string;
  studentId: string;
  name: string;
}

/** Alumnos a cargo de una persona (si es tutor). */
export async function loadWards(supabase: Client, profileId: string): Promise<Ward[]> {
  const { data } = await supabase
    .from("guardian_students")
    .select("id, student_id, student:students(first_name, last_name), guardian:guardians!inner(profile_id)")
    .eq("guardian.profile_id", profileId);
  return ((data ?? []) as unknown as { id: string; student_id: string; student: { first_name: string; last_name: string } | null }[]).map(
    (r) => ({ linkId: r.id, studentId: r.student_id, name: [r.student?.first_name, r.student?.last_name].filter(Boolean).join(" ") }),
  );
}
