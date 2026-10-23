import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface RosterRow {
  studentId: string;
  name: string;
  kind: "fija" | "reserva" | "otro";
  enabled: boolean;
  present: boolean;
}

/** Lista de una clase: fijos de ese día y reservas, con su presente. Vacía si no puede verla. */
export async function loadRoster(supabase: Client, sessionId: string): Promise<RosterRow[]> {
  const { data } = await supabase.rpc("session_roster", { p_session_id: sessionId });
  return ((data ?? []) as { student_id: string; full_name: string; kind: RosterRow["kind"]; enabled: boolean; present: boolean }[]).map(
    (r) => ({ studentId: r.student_id, name: r.full_name, kind: r.kind, enabled: r.enabled, present: r.present }),
  );
}

export function attendanceErrorCode(message: string | undefined, code: string | undefined): string {
  const m = message ?? "";
  if (m.startsWith("No está habilitado")) return "no-habilitado";
  if (m.startsWith("La asistencia se toma")) return "fuera-de-horario";
  if (code === "42501") return "sin-permiso";
  if (code === "P0002") return "no-disponible";
  return "generico";
}

export const ATTENDANCE_ERRORS: Record<string, string> = {
  "no-habilitado": "No está habilitado para esta clase: que pase por recepción.",
  "fuera-de-horario": "La asistencia se toma desde un rato antes de la clase y hasta 7 días después.",
  "sin-permiso": "Sólo podés tomar asistencia en tus clases.",
  "no-disponible": "Esa clase o ese alumno ya no están disponibles. Recargá la página.",
  generico: "No pudimos guardar la asistencia. Probá de nuevo.",
};
