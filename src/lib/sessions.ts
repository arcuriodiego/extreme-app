import "server-only";
import { academyConfig } from "@/config/academy";
import { groupName } from "@/domain/classes/schedule";
import type { SessionStatus } from "@/domain/classes/sessions";
import { addDays, type CalendarDate, calendarDateInZone, startOfDayInZone, timeInZone } from "@/domain/shared/calendar-date";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const TZ = academyConfig.timeZone;

export interface SessionRow {
  id: string;
  date: CalendarDate;
  start: string;
  end: string;
  startsAt: string;
  /** Todavía no empezó: se puede suspender o cambiar. */
  upcoming: boolean;
  groupId: string;
  scheduleId: string | null;
  title: string;
  roomName: string;
  capacity: number;
  status: SessionStatus;
  cancelReason: string | null;
  fromHoliday: boolean;
  teacherId: string | null;
  teacherName: string | null;
  teacherProfileId: string | null;
  substituteId: string | null;
  substituteName: string | null;
  substituteProfileId: string | null;
}

const SELECT = `
  id, starts_at, ends_at, capacity, status, cancel_reason, exception_id, group_id, schedule_id, teacher_id, substitute_teacher_id,
  room:rooms(name),
  group:class_groups(style:dance_styles(name), age:age_categories(name), level:levels(name)),
  teacher:teachers!class_sessions_academy_id_teacher_id_fkey(display_name, profile_id),
  substitute:teachers!class_sessions_academy_id_substitute_teacher_id_fkey(display_name, profile_id)
`;

interface Raw {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: SessionStatus;
  cancel_reason: string | null;
  exception_id: string | null;
  group_id: string;
  schedule_id: string | null;
  teacher_id: string | null;
  substitute_teacher_id: string | null;
  room: { name: string } | null;
  group: { style: { name: string } | null; age: { name: string } | null; level: { name: string } | null } | null;
  teacher: { display_name: string; profile_id: string } | null;
  substitute: { display_name: string; profile_id: string } | null;
}

/**
 * Se asegura de que existan las clases de las próximas semanas.
 * La base la ejecuta como mucho una vez por día; las demás veces no hace nada.
 */
export async function ensureSessions(supabase: Client): Promise<void> {
  await supabase.rpc("ensure_sessions");
}

/** Clases entre dos fechas de calendario (inclusive), en orden. */
export async function loadSessions(supabase: Client, from: CalendarDate, to: CalendarDate): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from("class_sessions")
    .select(SELECT)
    .gte("starts_at", startOfDayInZone(from, TZ).toISOString())
    .lt("starts_at", startOfDayInZone(addDays(to, 1), TZ).toISOString())
    .order("starts_at");
  if (error) throw new Error(`No se pudieron cargar las clases: ${error.message}`);

  const now = Date.now();
  return ((data ?? []) as unknown as Raw[]).map((r) => {
    const starts = new Date(r.starts_at);
    return {
      id: r.id,
      date: calendarDateInZone(starts, TZ),
      start: timeInZone(starts, TZ),
      end: timeInZone(new Date(r.ends_at), TZ),
      startsAt: r.starts_at,
      upcoming: starts.getTime() > now,
      groupId: r.group_id,
      scheduleId: r.schedule_id,
      title: groupName({
        style: r.group?.style?.name ?? "",
        ageCategory: r.group?.age?.name ?? "",
        level: r.group?.level?.name,
      }),
      roomName: r.room?.name ?? "",
      capacity: r.capacity,
      status: r.status,
      cancelReason: r.cancel_reason,
      fromHoliday: r.exception_id !== null,
      teacherId: r.teacher_id,
      teacherName: r.teacher?.display_name ?? null,
      teacherProfileId: r.teacher?.profile_id ?? null,
      substituteId: r.substitute_teacher_id,
      substituteName: r.substitute?.display_name ?? null,
      substituteProfileId: r.substitute?.profile_id ?? null,
    };
  });
}

export interface ExceptionRow {
  id: string;
  date: CalendarDate;
  kind: "holiday" | "closure";
  description: string;
}

export async function loadUpcomingExceptions(supabase: Client, from: CalendarDate): Promise<ExceptionRow[]> {
  const { data, error } = await supabase
    .from("calendar_exceptions")
    .select("id, date, kind, description")
    .gte("date", from)
    .order("date")
    .limit(50);
  if (error) throw new Error(`No se pudieron cargar los feriados: ${error.message}`);
  return (data ?? []) as ExceptionRow[];
}
