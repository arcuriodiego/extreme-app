import { NextResponse, type NextRequest } from "next/server";
import { academyConfig } from "@/config/academy";
import { canOpen } from "@/domain/navigation/menus";
import { parseMonth, summarizeTeachers, teachersCsv } from "@/domain/reports/teachers";
import { academyToday } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadTeacherReport } from "@/lib/teacher-report";

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
  const rows = await loadTeacherReport(await createClient(), month);
  const csv = teachersCsv(summarizeTeachers(rows, new Date()), (iso) => fmt.format(new Date(iso)));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte-profes-${month.slice(0, 7)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
