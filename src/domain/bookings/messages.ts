/** Mensajes de reservas, compartidos por las pantallas del alumno y de recepción. */

export const BOOKING_NOTICES: Record<string, string> = {
  reservada: "¡Listo, reservaste tu lugar!",
  "cancelada-devuelta": "Listo, cancelaste la reserva y la clase volvió a tu saldo.",
  "cancelada-tarde": "Cancelaste la reserva. Como faltaban menos de 12 horas, la clase no se devuelve.",
  "pack-vendido": "Listo, cobramos el pack y ya tiene sus clases disponibles.",
  "clase-cobrada": "Listo, cobramos la clase individual y quedó reservada.",
  "en-espera": "Listo, quedaste en la lista de espera. Si se libera un lugar, te avisamos en Avisos.",
  "lugar-confirmado": "¡Listo, el lugar es tuyo! La clase quedó reservada.",
  "salio-lista": "Listo, saliste de la lista de espera.",
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
  "lista-cerrada": "La lista de espera de esa clase ya cerró.",
  "hay-lugar": "Se liberó un lugar: reservala directamente.",
  "ya-en-lista": "Ya estás en la lista de espera de esa clase.",
  "oferta-vencida": "Se venció el plazo para confirmar ese lugar: pasó al siguiente de la lista.",
  "oferta-no-disponible": "Ese lugar ya no está disponible.",
  generico: "No pudimos hacerlo. Probá de nuevo.",
};

/** Traduce los errores de la base de reservas a un código de mensaje. */
export function bookingErrorCode(error: { code?: string; message?: string }): string {
  const m = error.message ?? "";
  if (m.startsWith("No tenés clases disponibles")) return "sin-saldo";
  if (m.startsWith("No hay lugar")) return "completa";
  if (m.startsWith("La lista de espera de esa clase ya cerró")) return "lista-cerrada";
  if (m.startsWith("Hay lugar")) return "hay-lugar";
  if (m.startsWith("Ya estás en la lista")) return "ya-en-lista";
  if (m.startsWith("Se venció el plazo")) return "oferta-vencida";
  if (m.startsWith("Ese lugar ya no está") || m.startsWith("Ya no estás en esa lista")) return "oferta-no-disponible";
  if (m.startsWith("Ya tenés reservada")) return "ya-reservada";
  if (m.startsWith("Esa clase ya es tu clase fija")) return "es-fija";
  if (m.startsWith("Esa clase está suspendida")) return "suspendida";
  if (m.startsWith("Esa clase ya empezó")) return "empezo";
  if (m.startsWith("Esa clase es sólo para")) return "solo-cuota";
  if (error.code === "42501") return "sin-permiso";
  return "generico";
}

