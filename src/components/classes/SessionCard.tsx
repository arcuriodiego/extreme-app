import { sessionBadges, teacherShown } from "@/domain/classes/sessions";
import type { SessionRow } from "@/lib/sessions";

const tones = {
  alert: "bg-alert-soft text-alert-ink",
  warn: "bg-warn-soft text-warn-ink",
  neutral: "bg-surface text-ink",
} as const;

/** Una clase de una fecha: hora, grupo, profe, sala y avisos. `children` agrega acciones. */
export function SessionCard({ session, extra, children }: { session: SessionRow; extra?: string; children?: React.ReactNode }) {
  const cancelled = session.status === "cancelled";
  const badges = sessionBadges(session);
  return (
    <article className={`flex flex-col gap-3 rounded-xl border p-3.5 ${cancelled ? "border-line bg-surface" : "border-line"}`}>
      <div className="flex gap-3">
        <span className={`w-[72px] shrink-0 font-display text-lg font-bold leading-tight tabular-nums ${cancelled ? "text-muted line-through" : ""}`}>
          {session.start}
          <span className="block text-sm font-semibold text-muted no-underline">a {session.end}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={`font-semibold leading-snug ${cancelled ? "text-muted" : ""}`}>{session.title}</span>
          <span className="text-sm text-muted">
            {teacherShown(session)} · {session.roomName}
            {extra ? ` · ${extra}` : ""}
          </span>
          {badges.length > 0 && (
            <span className="flex flex-wrap gap-1.5 pt-1">
              {badges.map((b) => (
                <span key={b.text} className={`rounded-full px-2 py-0.5 text-xs font-bold ${tones[b.tone]}`}>
                  {b.text}
                </span>
              ))}
            </span>
          )}
        </span>
      </div>
      {children}
    </article>
  );
}
