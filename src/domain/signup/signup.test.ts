import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDni, validateSignup } from "./signup.ts";

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const base = {
  for: "self",
  firstName: "",
  lastName: "",
  dni: "40.123.456",
  birthDate: "2000-05-10",
  phone: "11 5555-1234",
  relationship: "",
  scheduleIds: [S1, S1, S2],
  note: "  Vengo   de otra academia ",
};
const today = "2026-10-25";

test("inscripción propia válida, normalizada", () => {
  const r = validateSignup(base, today);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.dni, "40123456");
  assert.deepEqual(r.value.scheduleIds, [S1, S2]);
  assert.equal(r.value.note, "Vengo de otra academia");
  assert.equal(r.value.relationship, null);
});

test("para un hijo pide nombre, apellido y relación", () => {
  assert.deepEqual(validateSignup({ ...base, for: "child" }, today), { ok: false, error: "nombre" });
  assert.deepEqual(validateSignup({ ...base, for: "child", firstName: "Mateo" }, today), { ok: false, error: "apellido" });
  assert.deepEqual(validateSignup({ ...base, for: "child", firstName: "Mateo", lastName: "F" }, today), { ok: false, error: "relacion" });
  const r = validateSignup({ ...base, for: "child", firstName: " Mateo ", lastName: "Fernández", relationship: "madre" }, today);
  assert.ok(r.ok && r.value.firstName === "Mateo" && r.value.relationship === "madre");
});

test("datos obligatorios", () => {
  assert.deepEqual(validateSignup({ ...base, for: "otro" }, today), { ok: false, error: "para" });
  assert.deepEqual(validateSignup({ ...base, dni: "12" }, today), { ok: false, error: "dni" });
  assert.deepEqual(validateSignup({ ...base, birthDate: "" }, today), { ok: false, error: "nacimiento" });
  assert.deepEqual(validateSignup({ ...base, birthDate: "2027-01-01" }, today), { ok: false, error: "nacimiento" });
  assert.deepEqual(validateSignup({ ...base, phone: "abc" }, today), { ok: false, error: "telefono" });
  assert.deepEqual(validateSignup({ ...base, scheduleIds: [] }, today), { ok: false, error: "sin-horario" });
  assert.deepEqual(validateSignup({ ...base, scheduleIds: ["x"] }, today), { ok: false, error: "sin-horario" });
  const seven = Array.from({ length: 7 }, (_, i) => `1111111${i}-1111-1111-1111-111111111111`);
  assert.deepEqual(validateSignup({ ...base, scheduleIds: seven }, today), { ok: false, error: "muchos-horarios" });
});

test("DNI", () => {
  assert.equal(normalizeDni(" 40 123-456 "), "40123456");
});
