/**
 * Roles y permisos tal como los muestra la app.
 * La fuente de verdad de qué puede hacer cada rol es la base de datos;
 * acá sólo están los nombres para mostrar y el orden.
 */

export type RoleCode = "admin" | "reception" | "teacher" | "student" | "guardian";

export type PermissionCode =
  | "people.view"
  | "people.manage"
  | "roles.manage"
  | "settings.manage"
  | "audit.view"
  | "finance.view"
  | "payments.register"
  | "attendance.mark"
  | "classes.manage"
  | "classes.view_roster";

export const ROLE_LABELS: Record<RoleCode, string> = {
  admin: "Administración",
  reception: "Recepción",
  teacher: "Profesor",
  student: "Alumno",
  guardian: "Tutor",
};

/** Roles que administración puede asignar desde la pantalla de usuarios. */
export const ASSIGNABLE_ROLES: readonly RoleCode[] = ["admin", "reception", "teacher", "student"];

const ORDER: readonly RoleCode[] = ["admin", "reception", "teacher", "guardian", "student"];

export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === "string" && value in ROLE_LABELS;
}

/** Ordena roles del de más alcance al de menos, ignorando códigos desconocidos. */
export function sortRoles(codes: readonly string[]): RoleCode[] {
  return ORDER.filter((code) => codes.includes(code));
}

export function roleLabel(code: string): string {
  return isRoleCode(code) ? ROLE_LABELS[code] : code;
}

export interface Access {
  roles: RoleCode[];
  permissions: PermissionCode[];
}

export function can(access: Access, permission: PermissionCode): boolean {
  return access.permissions.includes(permission);
}

/** ¿Tiene acceso a alguna herramienta del personal (recepción, profes, administración)? */
export function isStaff(access: Access): boolean {
  return access.roles.some((r) => r === "admin" || r === "reception" || r === "teacher");
}
