import "server-only";
import { weekdayLabel } from "@/domain/classes/schedule";
import { seatsLeft } from "@/domain/classes/seats";
import type { GroupRow } from "@/lib/grilla";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Plazas fijas activas por horario (sin saber quiénes son). */
export async function loadFixedCounts(supabase: Client): Promise<Map<string, number>> {
  const { data } = await supabase.rpc("schedule_fixed_counts");
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { schedule_id: string; fixed: number }[]) map.set(row.schedule_id, row.fixed);
  return map;
}

export interface EnrollmentRow {
  id: string;
  scheduleId: string;
  label: string; // "Martes 19:00–20:30 · Hip Hop · Teens · Sala 1"
  weekday: number;
  start: string;
}

export interface MembershipRow {
  id: string;
  planName: string;
  teacherId: string;
  teacherName: string;
  ageCategoryId: string;
  ageCategoryName: string;
  anchorDay: number | null;
  startedOn: string;
  enrollments: EnrollmentRow[];
}

interface Raw {
  id: string;
  teacher_id: string;
  age_category_id: string;
  anchor_day: number | null;
  started_on: string;
  plan: { name: string } | null;
  teacher: { display_name: string } | null;
  age: { name: string } | null;
  enrollments:
    | {
        id: string;
        status: string;
        schedule_id: string;
        schedule: {
          weekday: number;
          start_time: string;
          end_time: string;
          room: { name: string } | null;
          group: { style: { name: string } | null; level: { name: string } | null } | null;
        } | null;
      }[]
    | null;
}

const SELECT = `
  id, teacher_id, age_category_id, anchor_day, started_on,
  plan:plans(name), teacher:teachers(display_name), age:age_categories(name),
  enrollments(id, status, schedule_id,
    schedule:class_schedules(weekday, start_time, end_time, room:rooms(name),
      group:class_groups(style:dance_styles(name), level:levels(name))))
`;

function toRow(r: Raw): MembershipRow {
  return {
    id: r.id,
    planName: r.plan?.name ?? "Cuota de profe",
    teacherId: r.teacher_id,
    teacherName: r.teacher?.display_name ?? "",
    ageCategoryId: r.age_category_id,
    ageCategoryName: r.age?.name ?? "",
    anchorDay: r.anchor_day,
    startedOn: r.started_on,
    enrollments: (r.enrollments ?? [])
      .flatMap((e) => (e.status === "active" && e.schedule ? [{ e, s: e.schedule }] : []))
      .map(({ e, s }) => {
        const start = s.start_time.slice(0, 5);
        const what = [s.group?.style?.name, s.group?.level?.name].filter(Boolean).join(" ");
        return {
          id: e.id,
          scheduleId: e.schedule_id,
          weekday: s.weekday,
          start,
          label: `${weekdayLabel(s.weekday)} ${start}–${s.end_time.slice(0, 5)} · ${what} · ${s.room?.name ?? ""}`,
        };
      })
      .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)),
  };
}

/** Cuotas activas de un alumno (por ficha). */
export async function loadActiveMemberships(supabase: Client, studentId: string): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select(SELECT)
    .eq("student_id", studentId)
    .eq("status", "active")
    .order("created_at");
  if (error) throw new Error(`No se pudieron cargar las cuotas: ${error.message}`);
  return ((data ?? []) as unknown as Raw[]).map(toRow);
}

export interface ScheduleOption {
  scheduleId: string;
  label: string;
  left: number;
  capacity: number;
  fixed: number;
}

/** Horarios vigentes de un profe y categoría, con lugares libres. */
export function scheduleOptions(groups: readonly GroupRow[], teacherId: string, ageCategoryId: string, fixed: Map<string, number>): ScheduleOption[] {
  const options = groups
    .filter((g) => g.status === "active" && g.teacherId === teacherId && g.ageCategoryId === ageCategoryId)
    .flatMap((g) =>
      g.schedules.map((s) => {
        const taken = fixed.get(s.id) ?? 0;
        return {
          order: s.weekday * 10000 + Number(s.start.replace(":", "")),
          option: {
            scheduleId: s.id,
            label: `${weekdayLabel(s.weekday)} ${s.start}–${s.end} · ${g.name} · ${s.roomName}`,
            left: seatsLeft(g.capacity, taken),
            capacity: g.capacity,
            fixed: taken,
          },
        };
      }),
    );
  return options.sort((a, b) => a.order - b.order).map((o) => o.option);
}

export interface FixedStudent {
  enrollmentId: string;
  scheduleId: string;
  studentId: string;
  name: string;
}

/** Quiénes tienen plaza fija activa en estos horarios (sólo para el personal). */
export async function loadFixedStudents(supabase: Client, scheduleIds: readonly string[]): Promise<FixedStudent[]> {
  if (scheduleIds.length === 0) return [];
  const { data } = await supabase
    .from("enrollments")
    .select("id, schedule_id, student:students(id, first_name, last_name)")
    .in("schedule_id", [...scheduleIds])
    .eq("status", "active");
  return ((data ?? []) as unknown as { id: string; schedule_id: string; student: { id: string; first_name: string; last_name: string } | null }[])
    .filter((r) => r.student)
    .map((r) => ({
      enrollmentId: r.id,
      scheduleId: r.schedule_id,
      studentId: r.student?.id ?? "",
      name: [r.student?.first_name, r.student?.last_name].filter(Boolean).join(" "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
