import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert, SmallSubmit } from "@/components/forms/fields";
import { NoAccess } from "@/components/status/NoAccess";
import { PageHeader } from "@/components/ui/basics";
import { academyConfig } from "@/config/academy";
import { can } from "@/domain/auth/roles";
import { canOpen } from "@/domain/navigation/menus";
import { ageOn } from "@/domain/people/student";
import { academyToday, loadGroups } from "@/lib/grilla";
import { requireProfile } from "@/lib/session";
import { type SignupRequestRow, loadSignupRequests, signupSlots, slotLabel } from "@/lib/signups";
import { createClient } from "@/lib/supabase/server";
import { resolveSignup } from "./actions";

export const metadata: Metadata = { title: "Inscripciones" };

const NOTICES: Record<string, string> = {
  resuelta: "Listo, la marcamos como resuelta.",
  descartada: "Listo, la descartamos.",
};
const ERRORS: Record<string, string> = {
  "sin-permiso": "No tenés permiso para resolver inscripciones.",
  "ya-resuelta": "Esa inscripción ya estaba resuelta. Recargá la página.",
  datos: "Revisá los datos.",
  generico: "No pudimos guardar el cambio. Probá de nuevo.",
};

const when = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: academyConfig.timeZone,
});

export default async function InscripcionesPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  if (!canOpen(profile.access, "inscripciones")) return <NoAccess />;
  const canManage = can(profile.access, "people.manage");
  const supabase = await createClient();
  const [{ pending, recent }, groups] = await Promise.all([loadSignupRequests(supabase), loadGroups(supabase)]);
  const slots = signupSlots(groups);
  const today = academyToday();
  const notice = params.aviso ? NOTICES[params.aviso] : undefined;
  const failure = params.error ? ERRORS[params.error] : undefined;

  function Card({ r }: { r: SignupRequestRow }) {
    const age = r.student.birthDate ? ageOn(r.student.birthDate, today) : null;
    return (
      <li className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <Link href={`/admin/alumnos/${r.student.id}`} className="text-lg font-semibold">
              {r.student.name}
            </Link>
            <span className="text-sm text-muted">
              {[age !== null ? `${age} años` : null, r.student.dni ? `DNI ${r.student.dni}` : null, r.student.phone].filter(Boolean).join(" · ")}
            </span>
            {r.byGuardian && <span className="text-sm">Lo anotó {r.requestedBy.name}{r.requestedBy.email ? ` (${r.requestedBy.email})` : ""}</span>}
          </div>
          <span className="text-sm text-muted">{when.format(new Date(r.createdAt))}</span>
        </div>
        <ul className="flex flex-col gap-1 text-[15px]">
          {r.scheduleIds.map((id) => (
            <li key={id}>{slotLabel(slots.find((s) => s.id === id))}</li>
          ))}
        </ul>
        {r.note && <p className="rounded-xl bg-surface px-3 py-2 text-[15px]">“{r.note}”</p>}
        {r.status === "pending" ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Link href={`/admin/alumnos/${r.student.id}`} className="inline-flex h-9 items-center rounded-full border border-ink bg-ink px-3.5 text-sm font-semibold text-white no-underline">
              Abrir ficha y dar la cuota
            </Link>
            {canManage && (
              <>
                <form action={resolveSignup}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value="confirmed" />
                  <SmallSubmit>Ya está resuelta</SmallSubmit>
                </form>
                <form action={resolveSignup}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value="dismissed" />
                  <SmallSubmit tone="danger">Descartar</SmallSubmit>
                </form>
              </>
            )}
          </div>
        ) : (
          <span className={`self-start rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "confirmed" ? "bg-ok-soft text-ok-ink" : "bg-surface"}`}>
            {r.status === "confirmed" ? "CONFIRMADA" : "DESCARTADA"}
            {r.handledAt ? ` · ${when.format(new Date(r.handledAt)).toUpperCase()}` : ""}
          </span>
        )}
      </li>
    );
  }

  return (
    <>
      <PageHeader title="Inscripciones" subtitle="Alumnos que se anotaron desde la app. Al darles la cuota en su ficha, la inscripción se confirma sola." />
      {notice && <FormAlert kind="ok">{notice}</FormAlert>}
      {failure && <FormAlert kind="error">{failure}</FormAlert>}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Pendientes ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-[15px] text-muted">No hay inscripciones pendientes.</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {pending.map((r) => (
              <Card key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <details className="border-t border-line pt-6">
          <summary className="cursor-pointer font-semibold">Últimas resueltas</summary>
          <ul className="grid gap-3 pt-3 lg:grid-cols-2">
            {recent.map((r) => (
              <Card key={r.id} r={r} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
