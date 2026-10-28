/**
 * Entornos de la app publicada.
 * - Producción (app.extremedance.com.ar): la base real, en São Paulo.
 * - Pruebas (pruebas.extremedance.com.ar): la base de staging, para probar antes de publicar.
 * Cada proyecto de Vercel define NEXT_PUBLIC_APP_ENV y NEXT_PUBLIC_APP_URL.
 * Si faltan, se asume producción: nunca se muestra el cartel de pruebas por error en la app real.
 */
export type AppEnv = "production" | "staging";

export const PRODUCTION_URL = "https://app.extremedance.com.ar";

export function appEnv(value: string | undefined): AppEnv {
  return value?.trim().toLowerCase() === "staging" ? "staging" : "production";
}

/** Dirección pública (sin barra final). Sólo https, o http para la compu local. */
export function appUrl(value: string | undefined, fallback: string = PRODUCTION_URL): string {
  const v = value?.trim().replace(/\/+$/, "");
  if (!v) return fallback;
  if (/^https:\/\/[a-z0-9.-]+$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)) return v.toLowerCase();
  return fallback;
}

/** Nombre con que se instala en el celular: la de pruebas se distingue a simple vista. */
export function installName(shortName: string, env: AppEnv): string {
  return env === "staging" ? `${shortName} PRUEBAS` : shortName;
}
