"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EntryCard } from "@/components/access/EntryCard";
import { Scanner } from "@/components/access/Scanner";
import type { Entry } from "@/domain/access/messages";
import { checkInStudentById, type FoundStudent, findStudents, scanAccessCode } from "./actions";

const input = "h-11 min-w-0 flex-1 rounded-xl border border-[#cfcfcf] bg-white px-3 text-base outline-none focus:border-ink";

/** Escáner + ingreso a mano buscando al alumno (si no tiene el celular). */
export function ScanStation({ canSearch }: { canSearch: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundStudent[] | null>(null);
  const [manual, setManual] = useState<Entry | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => router.refresh();

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
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Sin celular</h2>
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
          {manual && <EntryCard entry={manual} />}
        </section>
      )}
    </div>
  );
}
