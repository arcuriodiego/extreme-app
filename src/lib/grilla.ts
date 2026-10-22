import "server-only";
import { academyConfig } from "@/config/academy";
import { groupName, shortTime } from "@/domain/classes/schedule";
import { calendarDateInZone } from "@/domain/shared/calendar-date";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface CatalogItem {
  id: string;
  name: string;
  active: boolean;
}

export interface Room extends CatalogItem {
  capacity: number;
}

export interface Teacher {
  id: string;
  profileId: string;
  displayName: string;
  active: boolean;
}

export interface Catalog {
  styles: CatalogItem[];
  levels: CatalogItem[];
  ageCategories: CatalogItem[];
  rooms: Room[];
  teachers: Teacher[];
}

export async function loadCatalog(supabase: Client): Promise<Catalog> {
  const [styles, levels, ages, rooms, teachers] = await Promise.all([
    supabase.from("dance_styles").select("id, name, active").order("sort_order").order("name"),
    supabase.from("levels").select("id, name, active").order("sort_order").order("name"),
    supabase.from("age_categories").select("id, name, active").order("sort_order").order("name"),
    supabase.from("rooms").select("id, name, active, capacity").order("name"),
    supabase.from("teachers").select("id, profile_id, display_name, active").order("display_name"),
  ]);
  const firstError = [styles, levels, ages, rooms, teachers].find((r) => r.error)?.error;
  if (firstError) throw new Error(`No se pudo cargar el catálogo: ${firstError.message}`);

  return {
    styles: (styles.data ?? []) as CatalogItem[],
    levels: (levels.data ?? []) as CatalogItem[],
    ageCategories: (ages.data ?? []) as CatalogItem[],
    rooms: (rooms.data ?? []) as Room[],
    teachers: (teachers.data ?? []).map((t) => ({
      id: t.id as string,
      profileId: t.profile_id as string,
      displayName: t.display_name as string,
      active: t.active as boolean,
    })),
  };
}

export type GroupStatus = "active" | "paused" | "closed";

export interface ScheduleRow {
  id: string;
  weekday: number;
  start: string;
  end: string;
  roomId: string;
  roomName: string;
  validFrom: string;
  validTo: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
  styleId: string;
  ageCategoryId: string;
  levelId: string | null;
  teacherId: string | null;
  teacherName: string | null;
  teacherProfileId: string | null;
  capacity: number;
  allowsSingleBooking: boolean;
  description: string;
  status: GroupStatus;
  /** Horarios vigentes hoy o que empiezan más adelante. */
  schedules: ScheduleRow[];
}

const GROUP_SELECT = `
  id, style_id, age_category_id, level_id, teacher_id, capacity, allows_single_booking, description, status,
  style:dance_styles(name), age:age_categories(name), level:levels(name),
  teacher:teachers(display_name, profile_id),
  schedules:class_schedules(id, weekday, start_time, end_time, room_id, valid_from, valid_to, room:rooms(name))
`;

interface RawGroup {
  id: string;
  style_id: string;
  age_category_id: string;
  level_id: string | null;
  teacher_id: string | null;
  capacity: number;
  allows_single_booking: boolean;
  description: string | null;
  status: GroupStatus;
  style: { name: string } | null;
  age: { name: string } | null;
  level: { name: string } | null;
  teacher: { display_name: string; profile_id: string } | null;
  schedules:
    | {
        id: string;
        weekday: number;
        start_time: string;
        end_time: string;
        room_id: string;
        valid_from: string;
        valid_to: string | null;
        room: { name: string } | null;
      }[]
    | null;
}

export function academyToday(): string {
  return calendarDateInZone(new Date(), academyConfig.timeZone);
}

function toGroup(raw: RawGroup, today: string): GroupRow {
  return {
    id: raw.id,
    name: groupName({ style: raw.style?.name ?? "", ageCategory: raw.age?.name ?? "", level: raw.level?.name }),
    styleId: raw.style_id,
    ageCategoryId: raw.age_category_id,
    levelId: raw.level_id,
    teacherId: raw.teacher_id,
    teacherName: raw.teacher?.display_name ?? null,
    teacherProfileId: raw.teacher?.profile_id ?? null,
    capacity: raw.capacity,
    allowsSingleBooking: raw.allows_single_booking,
    description: raw.description ?? "",
    status: raw.status,
    schedules: (raw.schedules ?? [])
      .filter((s) => s.valid_to === null || s.valid_to >= today)
      .map((s) => ({
        id: s.id,
        weekday: s.weekday,
        start: shortTime(s.start_time),
        end: shortTime(s.end_time),
        roomId: s.room_id,
        roomName: s.room?.name ?? "",
        validFrom: s.valid_from,
        validTo: s.valid_to,
      }))
      .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)),
  };
}

/** Grupos de la academia con sus horarios. Por defecto, todos los estados. */
export async function loadGroups(supabase: Client, opts: { onlyActive?: boolean } = {}): Promise<GroupRow[]> {
  let query = supabase.from("class_groups").select(GROUP_SELECT).order("created_at");
  if (opts.onlyActive) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw new Error(`No se pudo cargar la grilla: ${error.message}`);
  const today = academyToday();
  return ((data ?? []) as unknown as RawGroup[]).map((g) => toGroup(g, today)).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function loadGroup(supabase: Client, id: string): Promise<GroupRow | null> {
  const { data, error } = await supabase.from("class_groups").select(GROUP_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toGroup(data as unknown as RawGroup, academyToday());
}

/** Horarios de la semana listos para la grilla, uno por fila. */
export interface Slot {
  id: string;
  weekday: number;
  start: string;
  end: string;
  groupId: string;
  title: string;
  teacherName: string | null;
  roomName: string;
  capacity: number;
  allowsSingleBooking: boolean;
  /** Sólo se muestra si empieza más adelante. */
  startsOn: string | null;
}

export function slotsOf(groups: readonly GroupRow[], today = academyToday()): Slot[] {
  return groups.flatMap((g) =>
    g.schedules.map((s) => ({
      id: s.id,
      weekday: s.weekday,
      start: s.start,
      end: s.end,
      groupId: g.id,
      title: g.name,
      teacherName: g.teacherName,
      roomName: s.roomName,
      capacity: g.capacity,
      allowsSingleBooking: g.allowsSingleBooking,
      startsOn: s.validFrom > today ? s.validFrom : null,
    })),
  );
}

/** Traduce los errores de la base de la grilla a mensajes claros. */
export function grillaErrorCode(error: { code?: string; message?: string }): string {
  const message = error.message ?? "";
  if (message.startsWith("El profe ya tiene") || message.includes("teacher_overlap")) return "profe-ocupado";
  if (error.code === "23P01") return "sala-ocupada";
  if (error.code === "P0002") return "no-disponible";
  if (error.code === "22023") return "motivo";
  if (error.code === "23505") return "repetido";
  if (error.code === "23503") return "en-uso";
  if (error.code === "42501") return "sin-permiso";
  if (error.code === "23514") return "datos";
  return "generico";
}

export const GRILLA_ERRORS: Record<string, string> = {
  "sala-ocupada": "Esa sala ya está ocupada en ese horario. Elegí otra sala u otro horario.",
  "profe-ocupado": "Ese profe ya tiene otra clase en ese horario.",
  "no-disponible": "Esa clase ya empezó o cambió mientras tanto. Recargá la página y probá de nuevo.",
  motivo: "Escribí el motivo.",
  repetido: "Ya existe uno con ese nombre.",
  "en-uso": "No se puede borrar porque está en uso. Podés desactivarlo.",
  "sin-permiso": "No tenés permiso para cambiar la grilla.",
  datos: "Revisá los datos: hay algo que no es válido.",
  generico: "No pudimos guardar el cambio. Probá de nuevo.",
};
