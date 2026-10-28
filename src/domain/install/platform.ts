/**
 * Para explicar cómo instalar la app (app web, sin tiendas): en qué tipo de celular
 * y navegador se abrió.
 */
export type Platform = "ios-safari" | "ios-other" | "android" | "desktop";

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  const ua = userAgent || "";
  // iPadOS se presenta como Mac: se distingue porque tiene pantalla táctil.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (isIOS) {
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV|Line\//.test(ua);
    return otherBrowser ? "ios-other" : "ios-safari";
  }
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/** Abierta desde Instagram o Facebook: esos navegadores internos no instalan apps. */
export function isInAppBrowser(userAgent: string): boolean {
  return /Instagram|FBAN|FBAV|Line\//.test(userAgent || "");
}

/** Días que no se vuelve a mostrar el aviso de instalar después de "Ahora no". */
export const INSTALL_SNOOZE_DAYS = 7;

export function snoozed(lastDismissedAt: number | null, now: number): boolean {
  return lastDismissedAt !== null && now - lastDismissedAt < INSTALL_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
}
