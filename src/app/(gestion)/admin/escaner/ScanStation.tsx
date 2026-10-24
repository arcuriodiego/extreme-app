"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { EntryCard } from "@/components/access/EntryCard";
import { Scanner } from "@/components/access/Scanner";
import { ARRIVAL_STATES, type ArrivalClass, type Entry } from "@/domain/access/messages";
import { checkInStudentById, type FoundStudent, findStudents, scanAccessCode } from "./actions";

const input = "h-11 min-w-0 flex-1 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

const TONES = {
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  alert: "bg-alert-soft text-alert-ink",
} as const;

const timeFormat = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

/** Escáner + ingreso a mano: "Llegando ahora" (un toque) o buscando al alumno. */
export function ScanStation({ canSearch, arrivals }: { canSearch: boolean; arrivals: ArrivalClass[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundStudent[] | null>(null);
  const [manual, setManual] = useState<Entry | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => router.refresh();

  // La lista de "Llegando ahora" se actualiza sola cada minuto (entran y salen clases de la ventana).
  useEffect(() => {
    if (!canSearch) return;
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [canSearch, router]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setManual(null);
      setFound(await findStudents(q));
    });
  }

  function checkIn(id: string) {
    startTransition(async () => {
      const entry = await checkInStudentById(id);
      setManual(entry);
      setFound(null);
      setQ("");
      refresh();
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Escanear pase</h2>
        <Scanner onCode={scanAccessCode} onResult={refresh} />
      </section>

      {canSearch && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Llegando ahora</h2>
          {arrivals.length === 0 ? (
            <p className="text-[15px] text-muted">No hay clases por empezar en este momento.</p>
          ) : (
            arrivals.map((c) => (
              <div key={c.session_id} className="flex flex-col rounded-[var(--radius-card)] border border-line p-3.5">
                <span className="font-semibold">
                  {timeFormat.format(new Date(c.starts_at))} · {c.label}
                </span>
                <span className="pb-1 text-sm text-muted">
                  {c.room} · {c.students.filter((s) => s.present).length} de {c.students.length} ingresaron
                </span>
                {c.students.length === 0 ? (
                  <p className="border-t border-line pt-2 text-sm text-muted">Sin alumnos fijos ni reservas.</p>
                ) : (
                  <ul className="flex flex-col">
                    {c.students.map((s) => {
                      const st = ARRIVAL_STATES[s.state];
                      return (
                        <li key={s.student_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2">
                          <span className="flex min-w-0 flex-col gap-1">
                            <span className="font-semibold">{s.name}</span>
                            <span className={`self-start rounded-full px-2 py-0.5 text-xs font-bold ${TONES[st.tone]}`}>
                              <span aria-hidden="true">{st.canEnter ? "✓ " : "✕ "}</span>
                              {st.label}
                            </span>
                          </span>
                          {s.present ? (
                            <span className="text-sm font-bold text-ok-ink">✓ Ingresó</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => checkIn(s.student_id)}
                              disabled={pending}
                              className={`h-9 shrink-0 rounded-full px-4 text-sm font-bold disabled:opacity-50 ${
                                st.canEnter ? "bg-ink text-white" : "border border-alert text-alert-ink"
                              }`}
                            >
                              {st.canEnter ? "Registrar ingreso" : "Ver detalle"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))
          )}
          {manual && <EntryCard entry={manual} />}

          <h2 className="pt-4 font-display text-2xl font-bold uppercase tracking-wide">Buscar alumno</h2>
          <p className="text-[15px] text-muted">Buscá al alumno por nombre o DNI y registrá el ingreso a mano.</p>
          <form onSubmit={search} className="flex gap-2">
            <label htmlFor="buscar-alumno" className="sr-only">
              Nombre o DNI
            </label>
            <input id="buscar-alumno" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o DNI" className={input} />
            <button type="submit" disabled={pending || q.trim().length < 2} className="h-11 rounded-full bg-ink px-5 font-bold text-white disabled:opacity-50">
              Buscar
            </button>
          </form>
          {found && found.length === 0 && <p className="text-[15px] text-muted">No encontramos alumnos con esa búsqueda.</p>}
          {found && found.length > 0 && (
            <ul className="flex flex-col">
              {found.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5">
                  <span className="flex flex-col">
                    <span className="font-semibold">{s.name}</span>
                    {s.dni && <span className="text-sm text-muted">DNI {s.dni}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => checkIn(s.id)}
                    disabled={pending}
                    className="h-9 shrink-0 rounded-full border border-ink px-4 text-sm font-bold disabled:opacity-50"
                  >
                    Registrar ingreso
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
