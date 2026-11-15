/** Mensajes de las compras desde la app (Mercado Pago). */
export const PURCHASE_ERRORS: Record<string, string> = {
  "compra-datos": "Algo salió mal. Recargá la página y probá de nuevo.",
  "mp-no-disponible": "Todavía no se puede pagar desde la app. Podés pagar en recepción o por transferencia.",
  "mp-error": "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.",
  "compra-sin-alumno": "Primero inscribite desde Inicio.",
  "compra-sin-permiso": "No podés comprar para este alumno.",
  "compra-completa": "Esa clase ya no tiene lugar. Elegí otra fecha.",
  "compra-repetida": "Ya está inscripto o ya lo compró.",
  "compra-no-disponible": "Eso ya no está disponible (o ya está pago). Recargá la página.",
  "comprobante-falta": "Adjuntá la captura o el PDF del comprobante.",
  "comprobante-tipo": "El comprobante tiene que ser una foto, una captura (JPG, PNG o WEBP) o un PDF.",
  "comprobante-pesado": "El comprobante pesa más de 3,5 MB. Mandá una captura de pantalla.",
  "comprobante-subida": "No pudimos subir el comprobante. Probá de nuevo.",
  "sin-datos-transferencia": "La academia todavía no cargó sus datos para transferir. Consultá en recepción.",
};

export const PURCHASE_NOTICES: Record<string, string> = {
  "transferencia-enviada": "¡Listo! Recibimos tu comprobante. Apenas recepción confirme la transferencia, se activa solo y te avisamos.",
};

/** Comprobante de transferencia: imagen o PDF de hasta 4 MB. */
export const PROOF_TYPES: Record<string, "jpg" | "png" | "webp" | "pdf"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
// La app recibe hasta 4 MB por envío: el comprobante, hasta 3,5 MB.
export const PROOF_MAX_BYTES = 3.5 * 1024 * 1024;

export function checkProof(file: File | null): { ok: true; ext: "jpg" | "png" | "webp" | "pdf" } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: "comprobante-falta" };
  const ext = PROOF_TYPES[file.type];
  if (!ext) return { ok: false, error: "comprobante-tipo" };
  if (file.size > PROOF_MAX_BYTES) return { ok: false, error: "comprobante-pesado" };
  return { ok: true, ext };
}
