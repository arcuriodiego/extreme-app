import { type Entry, ENTRY_TITLES, entryReason } from "@/domain/access/messages";

const styles = {
  allowed: { box: "bg-ok-soft border-ok", badge: "bg-ok", text: "text-ok-ink", icon: "M5 12.5l4.5 4.5L19 7.5" },
  grace: { box: "bg-warn-soft border-warn", badge: "bg-warn", text: "text-warn-ink", icon: "M5 12.5l4.5 4.5L19 7.5" },
  denied: { box: "bg-alert-soft border-alert", badge: "bg-alert", text: "text-alert-ink", icon: "M6 6l12 12M18 6L6 18" },
  invalid: { box: "bg-surface border-line", badge: "bg-ink", text: "text-ink", icon: "M12 7v6M12 17h.01" },
} as const;

const timeFormat = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

/** Resultado de un ingreso: color, ícono y texto (se entiende aunque no se distinga el color). */
export function EntryCard({ entry }: { entry: Entry }) {
  const s = styles[entry.result];
  const title = entry.reason === "error" || entry.reason === "sin-permiso" ? "No se pudo validar" : ENTRY_TITLES[entry.result];
  return (
    <div role="status" aria-live="assertive" className={`flex flex-col gap-2 rounded-[var(--radius-card)] border-2 p-4 ${s.box}`}>
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${s.badge}`} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d={s.icon} />
          </svg>
        </span>
        <span className={`font-display text-2xl font-bold uppercase leading-none tracking-wide ${s.text}`}>{title}</span>
      </div>
      {entry.studentName && <span className="text-xl font-bold">{entry.studentName}</span>}
      {entry.label && (
        <span className="text-[15px] font-semibold">
          {entry.label}
          {entry.startsAt ? ` · ${timeFormat.format(new Date(entry.startsAt))}` : ""}
        </span>
      )}
      <span className="text-[15px]">{entryReason(entry.reason)}</span>
      {entry.already && <span className="text-sm text-muted">Ya tenía el ingreso registrado en esta clase.</span>}
    </div>
  );
}
