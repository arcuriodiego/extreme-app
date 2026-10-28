import "server-only";
import type { PayrollLine } from "@/domain/reports/payroll";
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

export async function loadTeacherPayroll(supabase: Client, monthFirstDay: string): Promise<PayrollLine[]> {
  const { data, error } = await supabase.rpc("teacher_payroll", { p_month: monthFirstDay });
  if (error) throw new Error(`No se pudo cargar la liquidación: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    teacherId: r.teacher_id as string,
    teacherName: (r.teacher_name as string | null) ?? "Sin nombre",
    concept: r.concept as PayrollLine["concept"],
    occurredAt: r.occurred_at as string,
    studentName: (r.student_name as string | null) ?? "",
    detail: (r.detail as string | null) ?? "",
    baseCents: Number(r.base_cents ?? 0),
    shareCents: Number(r.share_cents ?? 0),
  }));
}

export async function loadTeacherSharePct(supabase: Client): Promise<number> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "teacher_share_pct").maybeSingle();
  return Number((data as { value: number } | null)?.value ?? 50);
}
