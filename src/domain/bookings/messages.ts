/** Mensajes de reservas, compartidos por las pantallas del alumno y de recepción. */

export const BOOKING_NOTICES: Record<string, string> = {
  reservada: "¡Listo, reservaste tu lugar!",
  "cancelada-devuelta": "Listo, cancelaste la reserva y la clase volvió a tu saldo.",
  "cancelada-tarde": "Cancelaste la reserva. Como faltaban menos de 12 horas, la clase no se devuelve.",
  "pack-vendido": "Listo, cobramos el pack y ya tiene sus clases disponibles.",
  "clase-cobrada": "Listo, cobramos la clase individual y quedó reservada.",
};

export const BOOKING_ERRORS: Record<string, string> = {
  "sin-saldo": "No tenés clases disponibles para esa fecha. Comprá un pack o una clase en recepción.",
  completa: "Esa clase se completó. Elegí otra.",
  "ya-reservada": "Ya tenés reservada esa clase.",
  "es-fija": "Esa clase ya es tu clase fija: no hace falta reservarla.",
  suspendida: "Esa clase está suspendida.",
  empezo: "Esa clase ya empezó.",
  "solo-cuota": "Esa clase es sólo para alumnos con cuota de profe.",
  "sin-permiso": "No tenés permiso para hacer esto.",
  generico: "No pudimos hacerlo. Probá de nuevo.",
};

/** Traduce los errores de la base de reservas a un código de mensaje. */
export function bookingErrorCode(error: { code?: string; message?: string }): string {
  const m = error.message ?? "";
  if (m.startsWith("No tenés clases disponibles")) return "sin-saldo";
  if (m.startsWith("No hay lugar")) return "completa";
  if (m.startsWith("Ya tenés reservada")) return "ya-reservada";
  if (m.startsWith("Esa clase ya es tu clase fija")) return "es-fija";
  if (m.startsWith("Esa clase está suspendida")) return "suspendida";
  if (m.startsWith("Esa clase ya empezó")) return "empezo";
  if (m.startsWith("Esa clase es sólo para")) return "solo-cuota";
  if (error.code === "42501") return "sin-permiso";
  return "generico";
}

