import "server-only";
import { academyConfig } from "@/config/academy";
import { groupName } from "@/domain/classes/schedule";
import { calendarDateInZone, timeInZone } from "@/domain/shared/calendar-date";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
const TZ = academyConfig.timeZone;

export interface Availability {
  capacity: number;
  fixed: number;
  booked: number;
  seatsLeft: number;
}

/** Lugares de cada clase: cupo, fijos de ese día, reservas y lugares libres. */
export async function loadAvailability(supabase: Client, sessionIds: readonly string[]): Promise<Map<string, Availability>> {
  const map = new Map<string, Availability>();
  if (sessionIds.length === 0) return map;
  const { data } = await supabase.rpc("session_availability", { p_session_ids: [...sessionIds] });
  for (const r of (data ?? []) as { session_id: string; capacity: number; fixed: number; booked: number; seats_left: number }[]) {
    map.set(r.session_id, { capacity: r.capacity, fixed: r.fixed, booked: r.booked, seatsLeft: r.seats_left });
  }
  return map;
}

export interface BalanceRow {
  id: string;
  kind: "pack" | "credit";
  name: string;
  total: number;
  remaining: number;
  validUntil: string;
  validUntilLabel: string;
  classWindowUntil: string | null;
  active: boolean;
}

interface RawBalance {
  id: string;
  kind: "pack" | "credit";
  units_total: number;
  valid_until: string;
  class_window_until: string | null;
  plan: { name: string } | null;
  movements: { units: number }[] | null;
}

const dateLabel = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: TZ });

function toBalance(r: RawBalance, now: number): BalanceRow {
  const remaining = (r.movements ?? []).reduce((s, m) => s + m.units, 0);
  // valid_until es exclusivo: el último día de uso es el anterior.
  const lastDay = new Date(new Date(r.valid_until).getTime() - 1);
  return {
    id: r.id,
    kind: r.kind,
    name: r.kind === "credit" ? "Crédito por cancelación" : (r.plan?.name ?? "Pack"),
    total: r.units_total,
    remaining,
    validUntil: r.valid_until,
    validUntilLabel: dateLabel.format(r.kind === "credit" ? new Date(r.valid_until) : lastDay),
    classWindowUntil: r.class_window_until,
    active: remaining > 0 && new Date(r.valid_until).getTime() > now,
  };
}

const BALANCE_SELECT = "id, kind, units_total, valid_until, class_window_until, plan:plans(name), movements:class_balance_movements(units)";

export async function loadBalances(supabase: Client, studentId: string): Promise<BalanceRow[]> {
  const { data } = await supabase
    .from("class_balances")
    .select(BALANCE_SELECT)
    .eq("student_id", studentId)
    .order("valid_until", { ascending: false })
    .limit(20);
  const now = Date.now();
  return ((data ?? []) as unknown as RawBalance[]).map((r) => toBalance(r, now));
}

export interface BookingRow {
  id: string;
  sessionId: string;
  startsAt: string;
  date: string;
  start: string;
  end: string;
  title: string;
  roomName: string;
  payKind: "pack" | "credit" | "single";
  sessionCancelled: boolean;
}

interface RawBooking {
  id: string;
  session_id: string;
  pay_kind: "pack" | "credit" | "single";
  session: {
    starts_at: string;
    ends_at: string;
    status: string;
    room: { name: string } | null;
    group: { style: { name: string } | null; age: { name: string } | null; level: { name: string } | null } | null;
  } | null;
}

const BOOKING_SELECT = `id, session_id, pay_kind,
  session:class_sessions(starts_at, ends_at, status, room:rooms(name),
    group:class_groups(style:dance_styles(name), age:age_categories(name), level:levels(name)))`;

/** Reservas confirmadas de un alumno en clases que todavía no empezaron. */
export async function loadUpcomingBookings(supabase: Client, studentId: string): Promise<BookingRow[]> {
  const { data } = await supabase.from("bookings").select(BOOKING_SELECT).eq("student_id", studentId).eq("status", "confirmed");
  const now = Date.now();
  return ((data ?? []) as unknown as RawBooking[])
    .filter((b) => b.session && new Date(b.session.starts_at).getTime() > now)
    .map((b) => {
      const s = b.session as NonNullable<RawBooking["session"]>;
      const st = new Date(s.starts_at);
      return {
        id: b.id,
        sessionId: b.session_id,
        startsAt: s.starts_at,
        date: calendarDateInZone(st, TZ),
        start: timeInZone(st, TZ),
        end: timeInZone(new Date(s.ends_at), TZ),
        title: groupName({ style: s.group?.style?.name ?? "", ageCategory: s.group?.age?.name ?? "", level: s.group?.level?.name }),
        roomName: s.room?.name ?? "",
        payKind: b.pay_kind,
        sessionCancelled: s.status === "cancelled",
      };
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** ¿Ya empezó la clase o falta menos que la anticipación para devolver? */
export function cancelPreview(startsAt: string, cancelHours = 12): "a-tiempo" | "tarde" {
  return new Date(startsAt).getTime() - Date.now() >= cancelHours * 3_600_000 ? "a-tiempo" : "tarde";
}
