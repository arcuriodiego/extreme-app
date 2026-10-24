import type { AnnouncementRow } from "@/lib/notifications";

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

/** Avisos enviados. */
export function SentList({ rows, showAuthor }: { rows: AnnouncementRow[]; showAuthor: boolean }) {
  if (rows.length === 0) return <p className="text-[15px] text-muted">Todavía no se enviaron avisos.</p>;
  return (
    <ul className="flex flex-col">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-col gap-0.5 border-t border-line py-3">
          <span className="font-semibold">{a.title}</span>
          {a.body && <span className="whitespace-pre-line text-[15px]">{a.body}</span>}
          <span className="text-sm text-muted">
            {dateFormat.format(new Date(a.createdAt))} · {a.groupName ?? "Todos los alumnos"} · llegó a {a.recipients}{" "}
            {a.recipients === 1 ? "persona" : "personas"}
            {showAuthor && a.authorName ? ` · ${a.authorName}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
