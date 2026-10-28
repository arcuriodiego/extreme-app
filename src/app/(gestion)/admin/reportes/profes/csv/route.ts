import { NextResponse, type NextRequest } from "next/server";
import { academyConfig } from "@/config/academy";
import { canOpen } from "@/domain/navigation/menus";
import { parseMonth, summarizeTeachers, teachersCsv } from "@/domain/reports/teachers";
import { academyToday } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { academyDayOf, loadTeacherPayroll, loadTeacherReport } from "@/lib/teacher-report";
import { payrollCsv, summarizePayroll } from "@/domain/reports/payroll";

const fmt = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: academyConfig.timeZone,
});

/** Reporte de profes del mes, en CSV para abrir con Excel. */
export async function GET(request: NextRequest) {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "reportes")) return new NextResponse("No tenés permiso.", { status: 403 });
  const month = parseMonth(request.nextUrl.searchParams.get("mes") ?? undefined, academyToday());
  const payroll = request.nextUrl.searchParams.get("tipo") === "liquidacion";
  const supabase = await createClient();
  const csv = payroll
    ? payrollCsv(summarizePayroll(await loadTeacherPayroll(supabase, month), academyDayOf), (iso) => fmt.format(new Date(iso)), academyDayOf)
    : teachersCsv(summarizeTeachers(await loadTeacherReport(supabase, month), new Date()), (iso) => fmt.format(new Date(iso)));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${payroll ? "liquidacion" : "clases"}-profes-${month.slice(0, 7)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
