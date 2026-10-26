import "server-only";
import { weekdayLabel } from "@/domain/classes/schedule";
import { type GroupRow, slotsOf } from "@/lib/grilla";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface SignupSlot {
  id: string;
  weekday: number;
  dayLabel: string;
  start: string;
  end: string;
  title: string;
  teacherName: string | null;
  roomName: string;
}

/** Horarios vigentes para elegir al inscribirse, ordenados por día y hora. */
export function signupSlots(groups: readonly GroupRow[]): SignupSlot[] {
  return slotsOf(groups)
    .map((s) => ({
      id: s.id,
      weekday: s.weekday,
      dayLabel: weekdayLabel(s.weekday),
      start: s.start,
      end: s.end,
      title: s.title,
      teacherName: s.teacherName,
      roomName: s.roomName,
    }))
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

export function slotLabel(s: SignupSlot | undefined): string {
  if (!s) return "Horario que ya no está en la grilla";
  return `${s.dayLabel} ${s.start} · ${s.title}${s.teacherName ? ` · Prof. ${s.teacherName}` : ""}`;
}

export interface SignupRequestRow {
  id: string;
  status: "pending" | "confirmed" | "dismissed";
  createdAt: string;
  handledAt: string | null;
  scheduleIds: string[];
  note: string | null;
  student: { id: string; name: string; dni: string | null; phone: string | null; birthDate: string | null; hasAccount: boolean };
  requestedBy: { id: string; name: string; email: string | null };
  /** Lo anotó otra persona (madre, padre o tutor). */
  byGuardian: boolean;
}

interface Raw {
  id: string;
  status: SignupRequestRow["status"];
  created_at: string;
  handled_at: string | null;
  schedule_ids: string[] | null;
  note: string | null;
  requested_by: string;
  student: { id: string; first_name: string; last_name: string; dni: string | null; phone: string | null; birth_date: string | null; profile_id: string | null } | null;
  requester: { first_name: string; last_name: string; email: string | null } | null;
}

const SELECT = `id, status, created_at, handled_at, schedule_ids, note, requested_by,
  student:students(id, first_name, last_name, dni, phone, birth_date, profile_id),
  requester:profiles!signup_requests_requested_by_fkey(first_name, last_name, email)`;

function toRow(r: Raw): SignupRequestRow {
  const s = r.student;
  return {
    id: r.id,
    status: r.status,
    createdAt: r.created_at,
    handledAt: r.handled_at,
    scheduleIds: r.schedule_ids ?? [],
    note: r.note,
    student: {
      id: s?.id ?? "",
      name: [s?.first_name, s?.last_name].filter(Boolean).join(" "),
      dni: s?.dni ?? null,
      phone: s?.phone ?? null,
      birthDate: s?.birth_date ?? null,
      hasAccount: !!s?.profile_id,
    },
    requestedBy: {
      id: r.requested_by,
      name: [r.requester?.first_name, r.requester?.last_name].filter(Boolean).join(" ") || (r.requester?.email ?? ""),
      email: r.requester?.email ?? null,
    },
    byGuardian: s?.profile_id !== r.requested_by,
  };
}

/** Para recepción: pendientes (las más viejas primero) y las últimas resueltas. */
export async function loadSignupRequests(supabase: Client): Promise<{ pending: SignupRequestRow[]; recent: SignupRequestRow[] }> {
  const [pending, recent] = await Promise.all([
    supabase.from("signup_requests").select(SELECT).eq("status", "pending").order("created_at"),
    supabase.from("signup_requests").select(SELECT).neq("status", "pending").order("handled_at", { ascending: false }).limit(15),
  ]);
  if (pending.error) throw new Error(`No se pudieron cargar las inscripciones: ${pending.error.message}`);
  return {
    pending: ((pending.data ?? []) as unknown as Raw[]).map(toRow),
    recent: ((recent.data ?? []) as unknown as Raw[]).map(toRow),
  };
}

export async function countPendingSignups(supabase: Client): Promise<number> {
  const { count } = await supabase.from("signup_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

/** La inscripción pendiente de un alumno (para su Inicio o su ficha). */
export async function loadPendingSignup(supabase: Client, studentId: string): Promise<SignupRequestRow | null> {
  const { data } = await supabase.from("signup_requests").select(SELECT).eq("student_id", studentId).eq("status", "pending").maybeSingle();
  return data ? toRow(data as unknown as Raw) : null;
}
