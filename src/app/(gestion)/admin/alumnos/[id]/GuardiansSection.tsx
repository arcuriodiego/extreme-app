import Link from "next/link";
import { SmallSubmit } from "@/components/forms/fields";
import { type GuardianLink, RELATIONSHIP_LABELS, type Ward } from "@/lib/guardians";
import { linkGuardian, unlinkGuardian } from "../actions";

const input = "h-10 min-w-0 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

/** Tutores del alumno (y, si la persona es tutora, sus alumnos a cargo). */
export function GuardiansSection({
  studentId,
  guardians,
  wards,
  canManage,
  isMinor,
}: {
  studentId: string;
  guardians: GuardianLink[];
  wards: Ward[];
  canManage: boolean;
  isMinor: boolean;
}) {
  return (
    <section id="tutores" className="flex scroll-mt-6 flex-col gap-3 border-t border-line pt-6">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Tutores</h2>
      {guardians.length === 0 ? (
        <p className={`text-[15px] ${isMinor ? "font-semibold text-warn-ink" : "text-muted"}`}>
          {isMinor ? "Es menor y no tiene tutor vinculado." : "No tiene tutores vinculados."}
        </p>
      ) : (
        <ul className="flex max-w-2xl flex-col">
          {guardians.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2.5">
              <span className="flex flex-col">
                <span className="font-semibold">
                  {g.name}
                  {g.relationship ? ` · ${RELATIONSHIP_LABELS[g.relationship]}` : ""}
                  {g.isPrimary ? " · principal" : ""}
                </span>
                <span className="text-sm text-muted">
                  {g.email ?? "Sin email"}
                  {g.canBook ? "" : " · sólo mira, no reserva"}
                </span>
              </span>
              {canManage && (
                <form action={unlinkGuardian}>
                  <input type="hidden" name="student_id" value={studentId} />
                  <input type="hidden" name="link_id" value={g.id} />
                  <SmallSubmit tone="danger">Desvincular</SmallSubmit>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form action={linkGuardian} className="flex max-w-2xl flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-4">
          <input type="hidden" name="student_id" value={studentId} />
          <span className="font-semibold">Vincular un tutor</span>
          <p className="text-sm text-muted">
            El tutor tiene que tener su cuenta en la app (se registra con su email). Desde su celular va a ver la cuota, las clases,
            los pagos y el pase QR de este alumno, y podrá reservar por él.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="tutor-email">
              Email del tutor
            </label>
            <input id="tutor-email" name="email" type="email" required placeholder="Email de su cuenta" className={`${input} flex-1`} />
            <label className="sr-only" htmlFor="tutor-relacion">
              Relación
            </label>
            <select id="tutor-relacion" name="relationship" defaultValue="" className={input}>
              <option value="">Relación (opcional)</option>
              <option value="madre">Madre</option>
              <option value="padre">Padre</option>
              <option value="tutor">Tutor/a</option>
            </select>
          </div>
          <div>
            <SmallSubmit tone="dark">Vincular</SmallSubmit>
          </div>
        </form>
      )}

      {wards.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Tiene a cargo</span>
          <ul className="flex flex-col">
            {wards.map((w) => (
              <li key={w.linkId} className="border-t border-line py-2">
                <Link href={`/admin/alumnos/${w.studentId}`} className="font-semibold">
                  {w.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
