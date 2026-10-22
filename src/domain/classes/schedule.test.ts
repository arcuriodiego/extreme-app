import { test } from "node:test";
import assert from "node:assert/strict";
import { groupName, shortTime, validateCapacity, validateCatalogName, validateSchedule, weekdayLabel, weeklyGrid } from "./schedule.ts";

test("nombre del grupo: estilo · categoría · nivel, con nivel opcional", () => {
  assert.equal(groupName({ style: "Hip Hop", ageCategory: "Teens", level: "Principiante" }), "Hip Hop · Teens · Principiante");
  assert.equal(groupName({ style: "Coreografía", ageCategory: "Teens", level: null }), "Coreografía · Teens");
});

test("días y horas para mostrar", () => {
  assert.equal(weekdayLabel(1), "Lunes");
  assert.equal(weekdayLabel(7), "Domingo");
  assert.equal(weekdayLabel(8), "");
  assert.equal(shortTime("19:00:00"), "19:00");
});

test("horario válido", () => {
  const r = validateSchedule({ weekday: "2", start: "19:00", end: "20:30", roomId: "sala" });
  assert.deepEqual(r, { ok: true, value: { weekday: 2, start: "19:00", end: "20:30", roomId: "sala" } });
});

test("horario inválido: mensajes por campo", () => {
  const r = validateSchedule({ weekday: "9", start: "7", end: "", roomId: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["end", "roomId", "start", "weekday"]);

  const reves = validateSchedule({ weekday: "1", start: "20:00", end: "19:00", roomId: "s" });
  assert.equal(!reves.ok && reves.errors.end, "La clase tiene que terminar después de empezar.");

  const corta = validateSchedule({ weekday: "1", start: "20:00", end: "20:10", roomId: "s" });
  assert.equal(!corta.ok && corta.errors.end, "La clase tiene que durar al menos 15 minutos.");

  assert.equal(validateSchedule({ weekday: "1", start: "24:00", end: "23:00", roomId: "s" }).ok, false);
});

test("nombres del catálogo", () => {
  assert.deepEqual(validateCatalogName("  Dancehall   Queen "), { ok: true, value: "Dancehall Queen" });
  assert.equal(validateCatalogName("   ").ok, false);
  assert.equal(validateCatalogName("x".repeat(41)).ok, false);
});

test("cupos", () => {
  assert.deepEqual(validateCapacity("20"), { ok: true, value: 20 });
  assert.equal(validateCapacity("0").ok, false);
  assert.equal(validateCapacity("201").ok, false);
  assert.equal(validateCapacity("12.5").ok, false);
  assert.equal(validateCapacity("").ok, false);
});

test("grilla semanal: lunes primero, por hora, sin días vacíos", () => {
  const grid = weeklyGrid([
    { id: "a", weekday: 4, start: "19:00", end: "20:30" },
    { id: "b", weekday: 2, start: "20:30", end: "22:00" },
    { id: "c", weekday: 2, start: "19:00", end: "20:30" },
  ]);
  assert.deepEqual(grid.map((d) => d.label), ["Martes", "Jueves"]);
  assert.deepEqual(grid[0]?.slots.map((s) => s.id), ["c", "b"]);
});
