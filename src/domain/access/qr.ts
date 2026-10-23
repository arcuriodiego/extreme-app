/**
 * Código QR del alumno: cambia cada 30 segundos, así una captura de pantalla deja de servir enseguida.
 *
 * Formato: EDA1.<id del alumno>.<ventana>.<firma>
 * - ventana = segundos desde 1970 / 30 (redondeado hacia abajo).
 * - firma = HMAC-SHA256(clave del alumno, "<id>:<ventana>"), primeros 16 caracteres hex.
 * La base de datos hace la misma cuenta para verificarlo (access_code_signature).
 */

export const QR_WINDOW_MS = 30_000;

export function qrWindow(ms: number): number {
  return Math.floor(ms / QR_WINDOW_MS);
}

/** Milisegundos hasta que cambie el código. */
export function msUntilNextWindow(ms: number): number {
  return QR_WINDOW_MS - (ms % QR_WINDOW_MS);
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error("Clave inválida.");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function qrSignature(secretHex: string, studentId: string, window: number): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey("raw", hexToBytes(secretHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await subtle.sign("HMAC", key, new TextEncoder().encode(`${studentId}:${window}`)));
  return Array.from(mac.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function accessCode(secretHex: string, studentId: string, nowMs: number): Promise<string> {
  const window = qrWindow(nowMs);
  return `EDA1.${studentId}.${window}.${await qrSignature(secretHex, studentId, window)}`;
}

/** ¿Parece un código nuestro? (la validación de verdad la hace la base) */
export function looksLikeAccessCode(text: string): boolean {
  return /^EDA1\.[0-9a-f-]{36}\.\d{1,12}\.[0-9a-f]{16}$/.test(text.trim());
}

/** Hora actual (aparte, para que las pantallas no llamen a Date.now() al dibujarse). */
export function currentTimeMs(): number {
  return Date.now();
}
