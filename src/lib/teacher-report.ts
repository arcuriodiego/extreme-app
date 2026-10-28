import "server-only";
import type { ReportSession } from "@/domain/reports/teachers";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadTeacherReport(supabase: Client, monthFirstDay: string): Promise<ReportSession[]> {
  const { data, error } = await supabase.rpc("teacher_report", { p_month: monthFirstDay });
  if (error) throw new Error(`No se pudo cargar el reporte: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    sessionId: r.session_id as string,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    status: r.status as ReportSession["status"],
    cancelReason: (r.cancel_reason as string | null) ?? null,
    groupName: r.group_name as string,
    ownerId: (r.owner_id as string | null) ?? null,
    ownerName: (r.owner_name as string | null) ?? null,
    taughtById: (r.taught_by_id as string | null) ?? null,
    taughtByName: (r.taught_by_name as string | null) ?? null,
    present: Number(r.present ?? 0),
  }));
}
