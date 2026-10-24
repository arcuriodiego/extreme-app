import "server-only";
import { academyConfig } from "@/config/academy";
import { type MembershipLight, membershipLight } from "@/domain/billing/membership-cycle";
import { addDays, type CalendarDate, startOfDayInZone, timeInZone, calendarDateInZone } from "@/domain/shared/calendar-date";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
const TZ = academyConfig.timeZone;

export type ChargeStatus = "open" | "partially_paid" | "paid" | "void";

export interface ChargeRow {
  id: string;
  studentId: string;
  membershipId: string | null;
  description: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  status: ChargeStatus;
}

export interface PaymentRow {
  id: string;
  studentId: string;
  studentName: string;
  method: string;
  amountCents: number;
  paidAt: string;
  date: CalendarDate;
  time: string;
  reference: string | null;
  status: "approved" | "void";
  voidReason: string | null;
  registeredBy: string | null;
  concepts: string[];
}

/** Genera las cuotas del mes que corresponda (una vez por día, en la base). */
export async function ensureCharges(supabase: Client): Promise<void> {
  await supabase.rpc("ensure_charges");
}

function toCharge(r: Record<string, unknown>): ChargeRow {
  const total = Number(r.total_cents);
  const paid = Number(r.paid_cents);
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    membershipId: (r.membership_id as string | null) ?? null,
    description: r.description as string,
    periodStart: (r.period_start as string | null) ?? null,
    periodEnd: (r.period_end as string | null) ?? null,
    dueDate: r.due_date as string,
    totalCents: total,
    paidCents: paid,
    pendingCents: Math.max(0, total - paid),
    status: r.status as ChargeStatus,
  };
}

const CHARGE_COLS = "id, student_id, membership_id, description, period_start, period_end, due_date, total_cents, paid_cents, status";

export async function loadCharges(supabase: Client, studentId: string): Promise<ChargeRow[]> {
  const { data, error } = await supabase
    .from("charges")
    .select(CHARGE_COLS)
    .eq("student_id", studentId)
    .neq("status", "void")
    .order("due_date", { ascending: false })
    .limit(60);
  if (error) throw new Error(`No se pudieron cargar los cargos: ${error.message}`);
  return (data ?? []).map((r) => toCharge(r as Record<string, unknown>));
}

const PAYMENT_COLS = `id, student_id, method, amount_cents, paid_at, reference, status, void_reason, registered_by,
  student:students(first_name, last_name),
  allocations:payment_allocations(charge:charges(description))`;

interface RawPayment {
  id: string;
  student_id: string;
  method: string;
  amount_cents: number;
  paid_at: string;
  reference: string | null;
  status: "approved" | "void";
  void_reason: string | null;
  registered_by: string | null;
  student: { first_name: string; last_name: string } | null;
  allocations: { charge: { description: string } | null }[] | null;
}

async function toPayments(supabase: Client, rows: RawPayment[]): Promise<PaymentRow[]> {
  // Quién registró cada pago (nombre del perfil del personal).
  const ids = [...new Set(rows.map((r) => r.registered_by).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
    for (const p of data ?? []) names.set(p.id as string, [p.first_name, p.last_name].filter(Boolean).join(" "));
  }
  return rows.map((r) => {
    const at = new Date(r.paid_at);
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: [r.student?.first_name, r.student?.last_name].filter(Boolean).join(" "),
      method: r.method,
      amountCents: Number(r.amount_cents),
      paidAt: r.paid_at,
      date: calendarDateInZone(at, TZ),
      time: timeInZone(at, TZ),
      reference: r.reference,
      status: r.status,
      voidReason: r.void_reason,
      registeredBy: r.registered_by ? (names.get(r.registered_by) ?? null) : null,
      concepts: (r.allocations ?? []).map((a) => a.charge?.description ?? "").filter(Boolean),
    };
  });
}

export async function loadPayments(supabase: Client, studentId: string): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_COLS)
    .eq("student_id", studentId)
    .order("paid_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron cargar los pagos: ${error.message}`);
  return toPayments(supabase, (data ?? []) as unknown as RawPayment[]);
}

/** Pagos registrados en un día (caja). */
export async function loadDayPayments(supabase: Client, day: CalendarDate): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_COLS)
    .gte("paid_at", startOfDayInZone(day, TZ).toISOString())
    .lt("paid_at", startOfDayInZone(addDays(day, 1), TZ).toISOString())
    .order("paid_at", { ascending: false });
  if (error) throw new Error(`No se pudo cargar la caja: ${error.message}`);
  return toPayments(supabase, (data ?? []) as unknown as RawPayment[]);
}

/** Semáforo de una cuota a partir de sus cargos. */
export function lightFor(charges: readonly ChargeRow[], today: CalendarDate, graceDays: number): MembershipLight {
  const live = charges.filter((c) => c.status !== "void");
  const upcoming = live
    .filter((c) => c.pendingCents > 0 && c.dueDate >= today)
    .map((c) => c.dueDate)
    .sort()[0];
  const lastEnd = live.map((c) => c.periodEnd).filter((d): d is string => Boolean(d)).sort().at(-1);
  return membershipLight({
    today,
    graceDays,
    charges: live.map((c) => ({ dueDate: c.dueDate, totalCents: c.totalCents, paidCents: c.paidCents })),
    nextDueDate: upcoming ?? (lastEnd ? addDays(lastEnd, 1) : null),
  });
}

export async function loadGraceDays(supabase: Client): Promise<number> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "grace_days").maybeSingle();
  return (data?.value as number | undefined) ?? 5;
}

export interface DebtorRow {
  studentId: string;
  studentName: string;
  description: string;
  dueDate: string;
  pendingCents: number;
  light: MembershipLight;
}

/** Cuotas vencidas e impagas: quién está en gracia y quién suspendido. */
export async function loadDebtors(supabase: Client, today: CalendarDate, graceDays: number): Promise<DebtorRow[]> {
  const { data, error } = await supabase
    .from("charges")
    .select(`${CHARGE_COLS}, student:students(first_name, last_name)`)
    .in("status", ["open", "partially_paid"])
    .lt("due_date", today)
    .order("due_date");
  if (error) throw new Error(`No se pudieron cargar las deudas: ${error.message}`);
  return (data ?? []).map((r) => {
    const c = toCharge(r as Record<string, unknown>);
    const s = (r as unknown as { student: { first_name: string; last_name: string } | null }).student;
    return {
      studentId: c.studentId,
      studentName: [s?.first_name, s?.last_name].filter(Boolean).join(" "),
      description: c.description,
      dueDate: c.dueDate,
      pendingCents: c.pendingCents,
      light: lightFor([c], today, graceDays),
    };
  });
}

