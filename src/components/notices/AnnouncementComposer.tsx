import { SmallSubmit } from "@/components/forms/fields";
import { sendAnnouncement } from "@/lib/announcement-actions";

const control = "min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

/** Formulario para enviar un aviso a un grupo (o a todos, si se ofrece). */
export function AnnouncementComposer({
  targets,
  back,
}: {
  targets: readonly { value: string; label: string }[];
  back: "/admin/avisos" | "/profe/avisos";
}) {
  return (
    <form action={sendAnnouncement} className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
      <input type="hidden" name="back" value={back} />
      <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor="aviso-destino">
        Para
        <select id="aviso-destino" name="target" required defaultValue={targets[0]?.value} className={`h-11 ${control}`}>
          {targets.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor="aviso-titulo">
        Título
        <input id="aviso-titulo" name="title" required maxLength={120} placeholder="Ej.: El sábado no hay clase" className={`h-11 ${control}`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor="aviso-mensaje">
        <span>
          Mensaje <span className="font-normal text-muted">(opcional)</span>
        </span>
        <textarea id="aviso-mensaje" name="body" maxLength={1000} rows={4} className={`py-3 ${control}`} />
      </label>
      <p className="text-sm text-muted">
        Llega a la bandeja de Avisos de cada alumno en la app (y de su tutor, si es menor). Más adelante también por email.
      </p>
      <div>
        <SmallSubmit tone="dark">Enviar aviso</SmallSubmit>
      </div>
    </form>
  );
}
