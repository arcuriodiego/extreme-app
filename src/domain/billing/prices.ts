/**
 * Precios de los planes, con historial. Cada precio rige desde su fecha
 * hasta que empieza el siguiente.
 */
import type { Cents } from "../shared/money.ts";

export interface PriceEntry {
  id: string;
  amountCents: Cents;
  validFrom: string; // "AAAA-MM-DD"
}

/** Precio vigente en una fecha, o null si todavía no había precio. */
export function priceOn(prices: readonly PriceEntry[], date: string): PriceEntry | null {
  return [...prices].filter((p) => p.validFrom <= date).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;
}

/** Próximo cambio programado después de una fecha. */
export function nextChange(prices: readonly PriceEntry[], date: string): PriceEntry | null {
  return [...prices].filter((p) => p.validFrom > date).sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0] ?? null;
}

/**
 * Lee un importe en pesos escrito a mano: "55500", "55.500", "$ 55.500", "55.500,50".
 * Devuelve centavos, o null si no se entiende o no es positivo.
 */
export function parsePesos(value: unknown): Cents | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[$\s]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(clean)) return null;
  const [whole = "", fraction = ""] = clean.split(",");
  const cents = Number(whole.replace(/\./g, "")) * 100 + Number(fraction.padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) && cents > 0 && cents < 100_000_000_000 ? cents : null;
}
