/**
 * Plazas fijas de la cuota de profe: elección de horarios y lugares libres.
 * El control definitivo del cupo lo hace la base al inscribir.
 */

/** Lugares libres de un horario según su cupo y las plazas fijas tomadas. */
export function seatsLeft(capacity: number, fixed: number): number {
  return Math.max(0, capacity - fixed);
}

/** "Quedan 3 lugares", "Queda 1 lugar", "Completo". */
export function seatsLabel(capacity: number, fixed: number): string {
  const left = seatsLeft(capacity, fixed);
  if (left === 0) return "Completo";
  return left === 1 ? "Queda 1 lugar" : `Quedan ${left} lugares`;
}

/** Valida la elección de horarios: cantidad exacta, sin repetir, todos entre los ofrecidos. */
export function validateSelection(
  chosen: readonly string[],
  required: number,
  offered: readonly string[],
): { ok: true; value: string[] } | { ok: false; error: "cantidad" | "repetido" | "no-ofrecido" } {
  const unique = [...new Set(chosen)];
  if (unique.length !== chosen.length) return { ok: false, error: "repetido" };
  if (chosen.length !== required) return { ok: false, error: "cantidad" };
  if (!chosen.every((id) => offered.includes(id))) return { ok: false, error: "no-ofrecido" };
  return { ok: true, value: unique };
}
