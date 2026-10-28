/**
 * Notificaciones al celular (Web Push): lo que viaja en cada notificación y
 * utilidades para las claves.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Pantalla de la app que se abre al tocarla. */
  url: string;
  /** Agrupa: una notificación nueva del mismo aviso reemplaza a la anterior. */
  tag: string;
}

/** Sólo rutas internas de la app (como en los emails); si no, la campanita. */
export function safeAppPath(link: string | null | undefined): string {
  return link && /^\/[a-z0-9/_-]*$/.test(link) ? link : "/avisos";
}

export function pushPayload(n: { id: string; title: string; body: string | null; link: string | null }): PushPayload {
  const body = (n.body ?? "").trim();
  return {
    title: n.title.slice(0, 120),
    body: body.length > 240 ? `${body.slice(0, 237)}…` : body,
    url: safeAppPath(n.link),
    tag: `aviso-${n.id}`,
  };
}

/** Clave pública VAPID (base64url) → bytes, como la pide el navegador al suscribirse. */
export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** ¿Parece una clave pública VAPID válida? (65 bytes, punto P-256 sin comprimir) */
export function isVapidPublicKey(value: string | undefined | null): value is string {
  if (!value || !/^[A-Za-z0-9_-]{80,100}$/.test(value)) return false;
  try {
    const bytes = base64UrlToBytes(value);
    return bytes.length === 65 && bytes[0] === 4;
  } catch {
    return false;
  }
}

/** El servicio de notificaciones avisa que la suscripción ya no existe. */
export function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

/** Lo que manda el celular al activar las notificaciones. */
export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}
