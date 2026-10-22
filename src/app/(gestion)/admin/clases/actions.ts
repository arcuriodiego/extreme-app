"use server";

import { redirect } from "next/navigation";
import { validateCapacity, validateCatalogName, validateSchedule } from "@/domain/classes/schedule";
import { grillaErrorCode } from "@/lib/grilla";
import { createClient } from "@/lib/supabase/server";

/**
 * Cambios de la grilla. Acá sólo se valida el formato y se arman mensajes;
 * permisos, academia y salas sin superposición los controla la base.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["active", "paused", "closed"] as const;

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optionalUuid(value: string): string | null | undefined {
  if (value === "") return null;
  return UUID.test(value) ? value : undefined; // undefined = inválido
}

function to(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

// ---------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------

function parseGroup(formData: FormData) {
  const styleId = str(formData, "style_id");
  const ageId = str(formData, "age_category_id");
  const levelId = optionalUuid(str(formData, "level_id"));
  const teacherId = optionalUuid(str(formData, "teacher_id"));
  const capacity = validateCapacity(str(formData, "capacity"));
  const status = str(formData, "status") || "active";
  const description = str(formData, "description").slice(0, 1000);

  if (!UUID.test(styleId)) return { error: "falta-estilo" } as const;
  if (!UUID.test(ageId)) return { error: "falta-categoria" } as const;
  if (levelId === undefined || teacherId === undefined) return { error: "datos" } as const;
  if (!capacity.ok) return { error: "cupo" } as const;
  if (!(STATUSES as readonly string[]).includes(status)) return { error: "datos" } as const;

  return {
    value: {
      style_id: styleId,
      age_category_id: ageId,
      level_id: levelId,
      teacher_id: teacherId,
      capacity: capacity.value,
      allows_single_booking: formData.get("allows_single_booking") === "on",
      status,
      description: description || null,
    },
  } as const;
}

export async function createGroup(formData: FormData): Promise<void> {
  const parsed = parseGroup(formData);
  if ("error" in parsed) to("/admin/clases/nuevo", { error: parsed.error ?? "datos" });

  const supabase = await createClient();
  const { data, error } = await supabase.from("class_groups").insert(parsed.value).select("id").single();
  if (error || !data) to("/admin/clases/nuevo", { error: error ? grillaErrorCode(error) : "generico" });
  to(`/admin/clases/${data.id}`, { aviso: "grupo-creado" });
}

export async function updateGroup(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  if (!UUID.test(id)) to("/admin/clases", { error: "datos" });
  const back = `/admin/clases/${id}`;

  const parsed = parseGroup(formData);
  if ("error" in parsed) to(back, { error: parsed.error ?? "datos" });

  const supabase = await createClient();
  const { data, error } = await supabase.from("class_groups").update(parsed.value).eq("id", id).select("id");
  if (error) to(back, { error: grillaErrorCode(error) });
  if (!data || data.length === 0) to(back, { error: "sin-permiso" });
  to(back, { aviso: "grupo-guardado" });
}

// ---------------------------------------------------------------------
// Horarios
// ---------------------------------------------------------------------

export async function addSchedule(formData: FormData): Promise<void> {
  const groupId = str(formData, "group_id");
  if (!UUID.test(groupId)) to("/admin/clases", { error: "datos" });
  const back = `/admin/clases/${groupId}`;

  const checked = validateSchedule({
    weekday: str(formData, "weekday"),
    start: str(formData, "start"),
    end: str(formData, "end"),
    roomId: str(formData, "room_id"),
  });
  if (!checked.ok) {
    const first = Object.keys(checked.errors)[0] ?? "datos";
    to(back, { error: `horario-${first}` });
  }
  if (!UUID.test(checked.value.roomId)) to(back, { error: "horario-roomId" });

  const supabase = await createClient();
  const { error } = await supabase.from("class_schedules").insert({
    group_id: groupId,
    weekday: checked.value.weekday,
    start_time: checked.value.start,
    end_time: checked.value.end,
    room_id: checked.value.roomId,
  });
  if (error) to(back, { error: grillaErrorCode(error) });
  to(back, { aviso: "horario-agregado" });
}

export async function removeSchedule(formData: FormData): Promise<void> {
  const groupId = str(formData, "group_id");
  const id = str(formData, "id");
  if (!UUID.test(groupId) || !UUID.test(id)) to("/admin/clases", { error: "datos" });
  const back = `/admin/clases/${groupId}`;

  const supabase = await createClient();
  const { data, error } = await supabase.from("class_schedules").delete().eq("id", id).eq("group_id", groupId).select("id");
  if (error) to(back, { error: grillaErrorCode(error) });
  if (!data || data.length === 0) to(back, { error: "sin-permiso" });
  to(back, { aviso: "horario-quitado" });
}

// ---------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------

const CATALOG_TABLES = { estilo: "dance_styles", nivel: "levels", categoria: "age_categories" } as const;
type CatalogKind = keyof typeof CATALOG_TABLES;
const CATALOG = "/admin/clases/catalogo";

function catalogKind(value: string): CatalogKind | null {
  return value in CATALOG_TABLES ? (value as CatalogKind) : null;
}

export async function addCatalogItem(formData: FormData): Promise<void> {
  const kind = catalogKind(str(formData, "kind"));
  const name = validateCatalogName(formData.get("name"));
  if (!kind) to(CATALOG, { error: "datos" });
  if (!name.ok) to(CATALOG, { error: "nombre" });

  const supabase = await createClient();
  const { error } = await supabase.from(CATALOG_TABLES[kind]).insert({ name: name.value, sort_order: 100 });
  if (error) to(CATALOG, { error: grillaErrorCode(error) });
  to(CATALOG, { aviso: "agregado" });
}

export async function setCatalogItemActive(formData: FormData): Promise<void> {
  const kind = str(formData, "kind");
  const id = str(formData, "id");
  const active = str(formData, "active") === "true";
  const table = kind === "sala" ? "rooms" : catalogKind(kind) ? CATALOG_TABLES[kind as CatalogKind] : null;
  if (!table || !UUID.test(id)) to(CATALOG, { error: "datos" });

  const supabase = await createClient();
  const { data, error } = await supabase.from(table).update({ active }).eq("id", id).select("id");
  if (error) to(CATALOG, { error: grillaErrorCode(error) });
  if (!data || data.length === 0) to(CATALOG, { error: "sin-permiso" });
  to(CATALOG, { aviso: active ? "activado" : "desactivado" });
}

export async function addRoom(formData: FormData): Promise<void> {
  const name = validateCatalogName(formData.get("name"));
  const capacity = validateCapacity(str(formData, "capacity"));
  if (!name.ok) to(CATALOG, { error: "nombre" });
  if (!capacity.ok) to(CATALOG, { error: "cupo" });

  const supabase = await createClient();
  const { data: branch } = await supabase.from("branches").select("id").eq("active", true).order("created_at").limit(1).maybeSingle();
  if (!branch) to(CATALOG, { error: "generico" });

  const { error } = await supabase.from("rooms").insert({ branch_id: branch.id, name: name.value, capacity: capacity.value });
  if (error) to(CATALOG, { error: grillaErrorCode(error) });
  to(CATALOG, { aviso: "agregado" });
}

export async function renameTeacher(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const name = str(formData, "display_name").replace(/\s+/g, " ");
  if (!UUID.test(id)) to(CATALOG, { error: "datos" });
  if (!name || name.length > 60) to(CATALOG, { error: "nombre-profe" });

  const supabase = await createClient();
  const { data, error } = await supabase.from("teachers").update({ display_name: name }).eq("id", id).select("id");
  if (error) to(CATALOG, { error: grillaErrorCode(error) });
  if (!data || data.length === 0) to(CATALOG, { error: "sin-permiso" });
  to(CATALOG, { aviso: "profe-guardado" });
}
