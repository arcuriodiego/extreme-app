"use server";

import { redirect } from "next/navigation";
import { attendanceErrorCode } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACKS = [/^\/profe\/asistencia\/[0-9a-f-]{36}$/, /^\/admin\/clases\/calendario\/lista\/[0-9a-f-]{36}$/];

/** Marca o desmarca presente a un alumno en una clase. */
export async function toggleAttendance(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("session_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const present = formData.get("present") === "1";
  const backRaw = String(formData.get("back") ?? "");
  const back = BACKS.some((r) => r.test(backRaw)) ? backRaw : "/inicio";
  if (!UUID.test(sessionId) || !UUID.test(studentId)) redirect(`${back}?error=generico`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_attendance", { p_session_id: sessionId, p_student_id: studentId, p_present: present });
  if (error) redirect(`${back}?error=${attendanceErrorCode(error.message, error.code)}`);
  redirect(back);
}
