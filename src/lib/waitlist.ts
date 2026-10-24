import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface WaitEntry {
  id: string;
  sessionId: string;
  status: "waiting" | "offered";
  offerExpiresAt: string | null;
  position: number;
}

/** Vence ofertas y ofrece lugares libres (una pasada por las listas con algo pendiente). */
export async function refreshWaitlists(supabase: Client): Promise<void> {
  await supabase.rpc("refresh_waitlists");
}

/** Anotaciones vigentes del alumno, por clase. */
export async function loadWaitlist(supabase: Client, studentId: string): Promise<Map<string, WaitEntry>> {
  const { data } = await supabase.rpc("waitlist_for_student", { p_student_id: studentId });
  const map = new Map<string, WaitEntry>();
  for (const r of (data ?? []) as { entry_id: string; session_id: string; status: "waiting" | "offered"; offer_expires_at: string | null; position: number }[]) {
    map.set(r.session_id, { id: r.entry_id, sessionId: r.session_id, status: r.status, offerExpiresAt: r.offer_expires_at, position: r.position });
  }
  return map;
}

/** Cuántos esperan en cada clase (para el personal). */
export async function loadWaitlistCounts(supabase: Client, sessionIds: readonly string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (sessionIds.length === 0) return map;
  const { data } = await supabase.rpc("waitlist_counts", { p_session_ids: [...sessionIds] });
  for (const r of (data ?? []) as { session_id: string; waiting: number }[]) map.set(r.session_id, r.waiting);
  return map;
}
