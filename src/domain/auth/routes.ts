/**
 * Qué páginas necesitan sesión y a dónde se puede volver después de ingresar.
 */

/** Páginas sólo para usuarios con sesión. */
const PROTECTED_PREFIXES = ["/inicio", "/perfil", "/nueva-clave", "/admin"];

/** Páginas que no tienen sentido con la sesión ya iniciada. */
const GUEST_ONLY = ["/ingresar", "/registro"];

export const HOME_PATH = "/inicio";
export const SIGN_IN_PATH = "/ingresar";

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export type RouteAccess = "protected" | "guest-only" | "public";

export function routeAccess(pathname: string): RouteAccess {
  if (PROTECTED_PREFIXES.some((p) => matches(pathname, p))) return "protected";
  if (GUEST_ONLY.some((p) => matches(pathname, p))) return "guest-only";
  return "public";
}

/**
 * Devuelve una ruta interna segura para redirigir, o null.
 * Evita que un enlace malicioso mande al usuario a otro sitio después de ingresar
 * (por ejemplo "?next=https://sitio-falso.com" o "?next=//sitio-falso.com").
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}

/** Tipos de enlace por email que acepta la pantalla de confirmación. */
export const EMAIL_LINK_TYPES = ["signup", "email", "recovery", "invite", "email_change"] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

export function parseEmailLinkType(value: unknown): EmailLinkType | null {
  return typeof value === "string" && (EMAIL_LINK_TYPES as readonly string[]).includes(value)
    ? (value as EmailLinkType)
    : null;
}

/** Hacia dónde va cada tipo de enlace si no se indica otra cosa. */
export function defaultNextFor(type: EmailLinkType): string {
  return type === "recovery" ? "/nueva-clave" : HOME_PATH;
}
