import "server-only";
import { academyConfig } from "@/config/academy";
import { calendarDateInZone, timeInZone } from "@/domain/shared/calendar-date";
import { refundDeadline, refundIfCancelled } from "@/domain/workshops/workshops";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
const TZ = academyConfig.timeZone;

export type WorkshopStatus = "draft" | "published" | "cancelled";

export interface WorkshopSessionRow {
  id: string;
  startsAt: string;
  date: string;
  start: string;
  end: string;
  roomId: string;
  roomName: string;
}

export interface WorkshopRow {
  id: string;
  title: string;
  description: string;
  teacherName: string | null;
  priceCents: number;
  capacity: number;
  status: WorkshopStatus;
  sessions: WorkshopSessionRow[];
  taken: number;
  firstStart: string | null;
  /** La última jornada ya terminó. */
  finished: boolean;
}

interface RawWorkshop {
  id: string;
  title: string;
  description: string | null;
  teacher_name: string | null;
  price_cents: number;
  capacity: number;
  status: WorkshopStatus;
  sessions: { id: string; starts_at: string; ends_at: string; room_id: string; room: { name: string } | null }[] | null;
}

const SELECT = "id, title, description, teacher_name, price_cents, capacity, status, sessions:workshop_sessions(id, starts_at, ends_at, room_id, room:rooms(name))";

export async function loadTakenCounts(supabase: Client): Promise<Map<string, number>> {
  const { data } = await supabase.rpc("workshop_taken_counts");
  const map = new Map<string, number>();
  for (const r of (data ?? []) as { workshop_id: string; taken: number }[]) map.set(r.workshop_id, r.taken);
  return map;
}

function toRow(r: RawWorkshop, taken: Map<string, number>, now: number): WorkshopRow {
  const sessions = (r.sessions ?? [])
    .map((s) => {
      const st = new Date(s.starts_at);
      return {
        id: s.id,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        date: calendarDateInZone(st, TZ),
        start: timeInZone(st, TZ),
        end: timeInZone(new Date(s.ends_at), TZ),
        roomId: s.room_id,
        roomName: s.room?.name ?? "",
      };
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const last = sessions.at(-1);
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    teacherName: r.teacher_name,
    priceCents: Number(r.price_cents),
    capacity: r.capacity,
    status: r.status,
    sessions: sessions.map((s) => ({ id: s.id, startsAt: s.startsAt, date: s.date, start: s.start, end: s.end, roomId: s.roomId, roomName: s.roomName })),
    taken: taken.get(r.id) ?? 0,
    firstStart: sessions[0]?.startsAt ?? null,
    finished: last ? new Date(last.endsAt).getTime() < now : false,
  };
}

export async function loadWorkshops(supabase: Client): Promise<WorkshopRow[]> {
  const [{ data, error }, taken] = await Promise.all([
    supabase.from("workshops").select(SELECT).order("created_at", { ascending: false }),
    loadTakenCounts(supabase),
  ]);
  if (error) throw new Error(`No se pudieron cargar los workshops: ${error.message}`);
  const now = Date.now();
  return ((data ?? []) as unknown as RawWorkshop[])
    .map((r) => toRow(r, taken, now))
    .sort((a, b) => (a.firstStart ?? "9999").localeCompare(b.firstStart ?? "9999"));
}

export async function loadWorkshop(supabase: Client, id: string): Promise<WorkshopRow | null> {
  const [{ data }, taken] = await Promise.all([supabase.from("workshops").select(SELECT).eq("id", id).maybeSingle(), loadTakenCounts(supabase)]);
  return data ? toRow(data as unknown as RawWorkshop, taken, Date.now()) : null;
}

export interface RegistrationRow {
  id: string;
  workshopId: string;
  studentId: string;
  name: string;
  isGuest: boolean;
  phone: string | null;
  status: "confirmed" | "cancelled";
  chargeId: string;
  totalCents: number;
  paidCents: number;
  refundCents: number;
  refundedCents: number;
}

interface RawReg {
  id: string;
  workshop_id: string;
  student_id: string;
  status: "confirmed" | "cancelled";
  charge_id: string;
  refund_cents: number;
  refunded_cents: number;
  student: { first_name: string; last_name: string; phone: string | null; profile_id: string | null } | null;
  charge: { total_cents: number; paid_cents: number } | null;
}

const REG_SELECT = `id, workshop_id, student_id, status, charge_id, refund_cents, refunded_cents,
  student:students(first_name, last_name, phone, profile_id), charge:charges(total_cents, paid_cents)`;

function toReg(r: RawReg): RegistrationRow {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    studentId: r.student_id,
    name: [r.student?.first_name, r.student?.last_name].filter(Boolean).join(" "),
    isGuest: !r.student?.profile_id,
    phone: r.student?.phone ?? null,
    status: r.status,
    chargeId: r.charge_id,
    totalCents: Number(r.charge?.total_cents ?? 0),
    paidCents: Number(r.charge?.paid_cents ?? 0),
    refundCents: Number(r.refund_cents),
    refundedCents: Number(r.refunded_cents),
  };
}

export async function loadRegistrations(supabase: Client, workshopId: string): Promise<RegistrationRow[]> {
  const { data, error } = await supabase.from("workshop_registrations").select(REG_SELECT).eq("workshop_id", workshopId).order("created_at");
  if (error) throw new Error(`No se pudieron cargar los inscriptos: ${error.message}`);
  return ((data ?? []) as unknown as RawReg[]).map(toReg);
}

/** Workshops en los que está inscripta la persona con sesión (la base sólo devuelve los suyos). */
export async function loadMyRegistrations(supabase: Client, profileId: string): Promise<RegistrationRow[]> {
  const { data } = await supabase
    .from("workshop_registrations")
    .select(`${REG_SELECT}, me:students!inner(profile_id)`)
    .eq("me.profile_id", profileId)
    .eq("status", "confirmed");
  return ((data ?? []) as unknown as RawReg[]).map(toReg);
}

export interface RefundRow {
  id: string;
  studentId: string;
  studentName: string;
  method: string;
  amountCents: number;
  reason: string;
  time: string;
}

/** Devoluciones registradas en un rango (para la caja). */
export async function loadRefunds(supabase: Client, fromIso: string, toIso: string): Promise<RefundRow[]> {
  const { data } = await supabase
    .from("refunds")
    .select("id, student_id, method, amount_cents, reason, refunded_at, student:students(first_name, last_name)")
    .gte("refunded_at", fromIso)
    .lt("refunded_at", toIso)
    .order("refunded_at", { ascending: false });
  return ((data ?? []) as unknown as {
    id: string;
    student_id: string;
    method: string;
    amount_cents: number;
    reason: string;
    refunded_at: string;
    student: { first_name: string; last_name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: [r.student?.first_name, r.student?.last_name].filter(Boolean).join(" "),
    method: r.method,
    amountCents: Number(r.amount_cents),
    reason: r.reason,
    time: timeInZone(new Date(r.refunded_at), TZ),
  }));
}

/** Cuánto correspondería devolver si se cancela en este momento (regla de 48 h). */
export function refundPreview(firstStart: string | null, paidCents: number): { refund: number; deadline: Date | null } {
  const start = firstStart ? new Date(firstStart) : null;
  return {
    refund: refundIfCancelled(start, new Date(), paidCents),
    deadline: start ? refundDeadline(start) : null,
  };
}
