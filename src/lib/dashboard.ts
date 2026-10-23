import "server-only";
import type { MembershipAlert } from "@/domain/dashboard/summary";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface DashboardClass {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "cancelled" | "completed";
  label: string;
  teacher: string | null;
  substitute: boolean;
  room: string;
  capacity: number;
  fixed: number;
  booked: number;
  present: number;
}

export interface DashboardAlert {
  student_id: string;
  name: string;
  state: MembershipAlert;
  since: string | null;
  owed_cents: number | null;
}

export interface DueSoon {
  kind: "cuota" | "pack";
  student_id: string;
  name: string;
  date: string;
  amount_cents?: number | null;
  remaining?: number;
}

export interface Dashboard {
  today: string;
  classes: DashboardClass[];
  entries: { allowed: number; denied: number };
  active_students: number;
  memberships: {
    grace: number;
    suspended: number;
    long_suspended: number;
    unpaid_first: number;
    owed_cents: number | null;
    list: DashboardAlert[];
  };
  due_soon: DueSoon[];
  cash_today?: number;
  month?: {
    from: string;
    by_concept: Record<string, number>;
    by_method: Record<string, number>;
    refunds: number;
    previous: number;
  };
}

/** Resumen del día y del mes, en una sola consulta. Lo que no puede ver no viene. */
export async function loadDashboard(supabase: Client): Promise<Dashboard> {
  const { data, error } = await supabase.rpc("dashboard_summary");
  if (error || !data) throw new Error(`No se pudo cargar el panel: ${error?.message ?? "sin datos"}`);
  return data as Dashboard;
}
