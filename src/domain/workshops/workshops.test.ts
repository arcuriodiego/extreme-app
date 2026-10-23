import { test } from "node:test";
import assert from "node:assert/strict";
import { refundDeadline, refundIfCancelled, seatsLabel, validateWorkshop, validateWorkshopSession } from "./workshops.ts";

const start = new Date("2026-11-07T18:00:00Z"); // sábado 15:00 en Buenos Aires

test("devolución: 48 h o más antes del inicio, sí; con menos, no", () => {
  assert.equal(refundDeadline(start).toISOString(), "2026-11-05T18:00:00.000Z");
  assert.equal(refundIfCancelled(start, new Date("2026-11-05T18:00:00Z"), 2_500_000), 2_500_000, "48 h exactas, devuelve");
  assert.equal(refundIfCancelled(start, new Date("2026-11-05T18:00:01Z"), 2_500_000), 0, "un segundo después, no");
  assert.equal(refundIfCancelled(null, new Date(), 1_000), 1_000, "sin fechas, devuelve");
});

test("lugares", () => {
  assert.equal(seatsLabel(10, 10), "Completo");
  assert.equal(seatsLabel(10, 9), "Queda 1 lugar");
  assert.equal(seatsLabel(10, 2), "Quedan 8 lugares");
});

test("formulario del workshop", () => {
  assert.deepEqual(validateWorkshop({ title: " Heels  intensivo ", description: "", teacherName: "", price: "25.000", capacity: "20" }), {
    ok: true,
    value: { title: "Heels intensivo", description: null, teacherName: null, priceCents: 2_500_000, capacity: 20 },
  });
  assert.deepEqual(validateWorkshop({ title: "", description: "", teacherName: "", price: "1", capacity: "1" }), { ok: false, error: "titulo" });
  assert.deepEqual(validateWorkshop({ title: "x", description: "", teacherName: "", price: "gratis", capacity: "1" }), { ok: false, error: "precio" });
  assert.deepEqual(validateWorkshop({ title: "x", description: "", teacherName: "", price: "100", capacity: "0" }), { ok: false, error: "cupo" });
});

test("jornada", () => {
  const today = "2026-10-23";
  assert.deepEqual(validateWorkshopSession({ date: "2026-11-07", start: "15:00", end: "18:00", roomId: "s" }, today), {
    ok: true,
    value: { date: "2026-11-07", startMinutes: 900, endMinutes: 1080, roomId: "s" },
  });
  assert.deepEqual(validateWorkshopSession({ date: "2026-10-22", start: "15:00", end: "18:00", roomId: "s" }, today), { ok: false, error: "fecha-pasada" });
  assert.deepEqual(validateWorkshopSession({ date: "2026-11-07", start: "18:00", end: "15:00", roomId: "s" }, today), { ok: false, error: "hora" });
  assert.deepEqual(validateWorkshopSession({ date: "2026-11-07", start: "15:00", end: "18:00", roomId: "" }, today), { ok: false, error: "sala" });
});
