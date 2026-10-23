/**
 * Qué secciones ve cada persona en la navegación.
 *
 * - Área personal (celular, barra inferior): alumno o profesor.
 * - Gestión (computadora o tablet, menú lateral): recepción y administración.
 *
 * El menú sólo decide qué se muestra. Cada página vuelve a comprobar el permiso
 * con canOpen() y la base de datos controla cada dato con sus políticas.
 */
import type { Access, PermissionCode } from "../auth/roles.ts";

export type IconName =
  | "home"
  | "calendar"
  | "ticket"
  | "card"
  | "user"
  | "check"
  | "bell"
  | "dashboard"
  | "people"
  | "scan"
  | "shield"
  | "settings";

export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: IconName;
}

interface GestionItem extends NavItem {
  /** Alcanza con tener uno de estos permisos. */
  anyOf: readonly PermissionCode[];
}

const STUDENT_TABS: readonly NavItem[] = [
  { key: "inicio", href: "/inicio", label: "Inicio", icon: "home" },
  { key: "clases", href: "/clases", label: "Clases", icon: "calendar" },
  { key: "pases", href: "/pases", label: "Mis pases", icon: "ticket" },
  { key: "pagos", href: "/pagos", label: "Pagos", icon: "card" },
  { key: "perfil", href: "/perfil", label: "Perfil", icon: "user" },
];

const TEACHER_TABS: readonly NavItem[] = [
  { key: "inicio", href: "/inicio", label: "Inicio", icon: "home" },
  { key: "profe-clases", href: "/profe/clases", label: "Mis clases", icon: "calendar" },
  { key: "profe-asistencia", href: "/profe/asistencia", label: "Asistencia", icon: "check" },
  { key: "profe-avisos", href: "/profe/avisos", label: "Avisos", icon: "bell" },
  { key: "perfil", href: "/perfil", label: "Perfil", icon: "user" },
];

const GESTION_ITEMS: readonly GestionItem[] = [
  { key: "panel", href: "/admin", label: "Panel", icon: "dashboard", anyOf: ["people.view"] },
  { key: "alumnos", href: "/admin/alumnos", label: "Alumnos", icon: "people", anyOf: ["people.view"] },
  { key: "clases", href: "/admin/clases", label: "Clases y grilla", icon: "calendar", anyOf: ["classes.manage", "classes.view_roster"] },
  { key: "pagos", href: "/admin/pagos", label: "Pagos", icon: "card", anyOf: ["payments.register", "finance.view"] },
  { key: "workshops", href: "/admin/workshops", label: "Workshops", icon: "ticket", anyOf: ["people.view", "classes.manage"] },
  { key: "escaner", href: "/admin/escaner", label: "Escáner QR", icon: "scan", anyOf: ["attendance.mark"] },
  { key: "usuarios", href: "/admin/usuarios", label: "Usuarios y roles", icon: "shield", anyOf: ["roles.manage"] },
  { key: "configuracion", href: "/admin/configuracion", label: "Configuración", icon: "settings", anyOf: ["settings.manage"] },
];

export type GestionSection = (typeof GESTION_ITEMS)[number]["key"];

/** Barra inferior del área personal. Quien tiene rol de profesor ve sus herramientas. */
export type PersonalMode = "alumno" | "profe";

/** ¿Puede elegir entre la vista de alumno y la de profe? (profe que también toma clases) */
export function canSwitchMode(access: Access): boolean {
  return access.roles.includes("teacher") && access.roles.includes("student");
}

/** La vista que corresponde: la elegida si puede elegir; si no, la de su rol. */
export function resolveMode(access: Access, chosen: unknown): PersonalMode {
  if (!access.roles.includes("teacher")) return "alumno";
  if (canSwitchMode(access) && chosen === "alumno") return "alumno";
  return "profe";
}

export function personalTabs(access: Access, chosen?: unknown): NavItem[] {
  const tabs = resolveMode(access, chosen) === "profe" ? TEACHER_TABS : STUDENT_TABS;
  return tabs.map(({ key, href, label, icon }) => ({ key, href, label, icon }));
}

/**
 * Gestión es para recepción y administración. Un profe también tiene permisos de
 * asistencia y listas, pero los usa desde sus propias herramientas, no desde acá.
 */
function isOffice(access: Access): boolean {
  return access.roles.includes("admin") || access.roles.includes("reception");
}

/** Menú lateral de gestión, sólo con lo que la persona puede abrir. */
export function gestionMenu(access: Access): NavItem[] {
  if (!isOffice(access)) return [];
  return GESTION_ITEMS.filter((item) => item.anyOf.some((p) => access.permissions.includes(p))).map(
    ({ key, href, label, icon }) => ({ key, href, label, icon }),
  );
}

/** ¿Puede abrir esta sección de gestión? Lo usa cada página como segundo control. */
export function canOpen(access: Access, section: string): boolean {
  const item = GESTION_ITEMS.find((i) => i.key === section);
  return isOffice(access) && item !== undefined && item.anyOf.some((p) => access.permissions.includes(p));
}

/** ¿Tiene alguna sección de gestión? (recepción o administración). */
export function hasGestion(access: Access): boolean {
  return gestionMenu(access).length > 0;
}

/**
 * Qué ítem marcar como activo según la dirección actual.
 * Gana el más específico: en "/admin/alumnos/123" se marca "Alumnos", no "Panel".
 */
export function activeKey(items: readonly NavItem[], pathname: string): string | null {
  let best: NavItem | null = null;
  for (const item of items) {
    const hit = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.key ?? null;
}
