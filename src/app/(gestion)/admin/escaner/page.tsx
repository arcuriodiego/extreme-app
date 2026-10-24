import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { can } from "@/domain/auth/roles";
import { type ArrivalClass, ENTRY_TITLES, type EntryResult, entryReason } from "@/domain/access/messages";
import { canOpen } from "@/domain/navigation/menus";
import { startOfDayInZone } from "@/domain/shared/calendar-date";
import { academyConfig } from "@/config/academy";
import { academyToday } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ScanStation } from "./ScanStation";
import { currentTimeMs } from "@/domain/access/qr";

export const metadata: Metadata = { title: "Escáner QR" };

interface LogRow {
  id: string;
  created_at: string;
  result: EntryResult;
  reason: string;
  label: string | null;
  method: "qr" | "manual";
  student_id: string | null;
  student: { first_name: string; last_name: string } | null;
}

const tones: Record<EntryResult, string> = {
  allowed: "bg-ok-soft text-ok-ink",
  grace: "bg-warn-soft text-warn-ink",
  denied: "bg-alert-soft text-alert-ink",
  invalid: "bg-surface text-ink",
};

const timeFormat = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: academyConfig.timeZone });

export default async function EscanerPage() {
  const profile = await requireProfile();
  if (!canOpen(profile.access, "escaner")) return <NoAccess />;
  const canSee = can(profile.access, "people.view");

  let logs: LogRow[] = [];
  let arrivals: ArrivalClass[] = [];
  let window = { before: 30, after: 15 };
  let next: { label: string; startsAt: string } | null = null;
  if (canSee) {
    const supabase = await createClient();
    const [{ data }, arrivalsRes] = await Promise.all([
      supabase
      .from("access_logs")
      .select("id, created_at, result, reason, label, method, student_id, student:students(first_name, last_name)")
      .gte("created_at", startOfDayInZone(academyToday(), academyConfig.timeZone).toISOString())
      .order("created_at", { ascending: false })
      .limit(40),
      supabase.rpc("arrivals_now"),
    ]);
    const [{ data: rules }, { data: upcoming }] = await Promise.all([
      supabase.from("app_settings").select("key, value").in("key", ["checkin_before_minutes", "checkin_after_minutes"]),
      supabase
        .from("class_sessions")
        .select("starts_at, group:class_groups(style:dance_styles(name), age:age_categories(name), level:levels(name))")
        .eq("status", "scheduled")
        .gt("starts_at", new Date(currentTimeMs()).toISOString())
        .order("starts_at")
        .limit(1),
    ]);
    const r = (rules ?? []) as { key: string; value: number }[];
    window = {
      before: r.find((x) => x.key === "checkin_before_minutes")?.value ?? 30,
      after: r.find((x) => x.key === "checkin_after_minutes")?.value ?? 15,
    };
    const u = ((upcoming ?? []) as unknown as {
      starts_at: string;
      group: { style: { name: string } | null; age: { name: string } | null; level: { name: string } | null } | null;
    }[])[0];
    if (u) {
      next = {
        startsAt: u.starts_at,
        label: [u.group?.style?.name, u.group?.age?.name, u.group?.level?.name].filter(Boolean).join(" · "),
      };
    }
    logs = (data ?? []) as unknown as LogRow[];
    arrivals = (arrivalsRes.data ?? []) as ArrivalClass[];
  }

  return (
    <>
      <PageHeader title="Escáner QR" subtitle="Escaneá el pase del alumno: la app dice si puede pasar y registra la asistencia de la clase." />
      <ScanStation canSearch={canSee} arrivals={arrivals} window={window} next={next} />

      {canSee && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Ingresos de hoy</h2>
          {logs.length === 0 ? (
            <p className="text-[15px] text-muted">Todavía no hay ingresos hoy.</p>
          ) : (
            <ul className="flex max-w-3xl flex-col">
              {logs.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5 text-[15px]">
                  <span className="w-12 shrink-0 font-semibold tabular-nums">{timeFormat.format(new Date(l.created_at))}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${tones[l.result]}`}>{ENTRY_TITLES[l.result]}</span>
                  <span className="min-w-0 flex-1">
                    {l.student && l.student_id ? (
                      <Link href={`/admin/alumnos/${l.student_id}`} className="font-semibold">
                        {`${l.student.first_name} ${l.student.last_name}`.trim()}
                      </Link>
                    ) : (
                      <span className="font-semibold">Código no reconocido</span>
                    )}
                    <span className="text-muted">
                      {" "}
                      · {l.label ?? entryReason(l.reason)}
                      {l.method === "manual" ? " · a mano" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
