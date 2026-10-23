import { test } from "node:test";
import assert from "node:assert/strict";
import type { Access, PermissionCode } from "../auth/roles.ts";
import { activeKey, canOpen, canSwitchMode, gestionMenu, hasGestion, personalTabs, resolveMode } from "./menus.ts";

// Permisos tal como los asigna la base (seed_default_roles).
const ALL: PermissionCode[] = [
  "people.view", "people.manage", "roles.manage", "settings.manage", "audit.view",
  "finance.view", "payments.register", "attendance.mark", "classes.manage", "classes.view_roster",
];
const admin: Access = { roles: ["admin", "student"], permissions: ALL };
const reception: Access = {
  roles: ["reception", "student"],
  permissions: ["people.view", "people.manage", "payments.register", "attendance.mark", "classes.view_roster"],
};
const teacher: Access = { roles: ["teacher", "student"], permissions: ["attendance.mark", "classes.view_roster"] };
const student: Access = { roles: ["student"], permissions: [] };

const keys = (items: { key: string }[]) => items.map((i) => i.key);

test("alumno: barra inferior con sus 5 secciones y sin gestión", () => {
  assert.deepEqual(keys(personalTabs(student)), ["inicio", "clases", "pases", "pagos", "perfil"]);
  assert.deepEqual(gestionMenu(student), []);
  assert.equal(hasGestion(student), false);
});

test("profesor: ve sus herramientas aunque también sea alumno, y no entra a gestión", () => {
  assert.deepEqual(keys(personalTabs(teacher)), ["inicio", "profe-clases", "profe-asistencia", "profe-avisos", "perfil"]);
  assert.equal(hasGestion(teacher), false);
  assert.equal(canOpen(teacher, "escaner"), false);
});

test("recepción: operación diaria, sin roles ni configuración", () => {
  assert.deepEqual(keys(gestionMenu(reception)), ["panel", "alumnos", "clases", "pagos", "workshops", "escaner"]);
  assert.equal(canOpen(reception, "usuarios"), false);
  assert.equal(canOpen(reception, "configuracion"), false);
});

test("administración: todo el menú", () => {
  assert.deepEqual(keys(gestionMenu(admin)), [
    "panel", "alumnos", "clases", "pagos", "workshops", "escaner", "usuarios", "configuracion",
  ]);
});

test("sección inexistente: nunca se puede abrir", () => {
  assert.equal(canOpen(admin, "cualquiera"), false);
});

test("ítem activo: gana el más específico", () => {
  const menu = gestionMenu(admin);
  assert.equal(activeKey(menu, "/admin"), "panel");
  assert.equal(activeKey(menu, "/admin/alumnos/123"), "alumnos");
  assert.equal(activeKey(menu, "/admin/alumnosx"), "panel");
  assert.equal(activeKey(personalTabs(student), "/inicio"), "inicio");
  assert.equal(activeKey(personalTabs(student), "/nueva-clave"), null);
});

test("profe que también es alumno: puede cambiar a la vista de alumno", () => {
  assert.equal(canSwitchMode(teacher), true);
  assert.equal(resolveMode(teacher, undefined), "profe");
  assert.deepEqual(keys(personalTabs(teacher, "alumno")), ["inicio", "clases", "pases", "pagos", "perfil"]);
  const onlyTeacher: Access = { roles: ["teacher"], permissions: [] };
  assert.equal(canSwitchMode(onlyTeacher), false);
  assert.equal(resolveMode(onlyTeacher, "alumno"), "profe");
  assert.equal(resolveMode(student, "profe"), "alumno");
});
