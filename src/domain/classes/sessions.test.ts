import { test } from "node:test";
import assert from "node:assert/strict";
import { dayStrip, longDate, pickDay, sessionBadges, teacherShown, validateException } from "./sessions.ts";
import { isoWeekday, startOfDayInZone, timeInZone } from "../shared/calendar-date.ts";

const BA = "America/Argentina/Buenos_Aires";

test("zona horaria de la academia", () => {
  assert.equal(startOfDayInZone("2026-10-27", BA).toISOString(), "2026-10-27T03:00:00.000Z");
  assert.equal(timeInZone(new Date("2026-10-27T22:00:00Z"), BA), "19:00");
  assert.equal(timeInZone(new Date("2026-10-28T02:30:00Z"), BA), "23:30");
  assert.equal(isoWeekday("2026-10-26"), 1); // lunes
  assert.equal(isoWeekday("2026-11-01"), 7); // domingo
});

test("selector de días: 7 días desde hoy", () => {
  const strip = dayStrip("2026-10-30");
  assert.equal(strip.length, 7);
  assert.deepEqual(strip[0], { date: "2026-10-30", short: "VIE", dayNumber: 30, isToday: true });
  assert.equal(strip[2]?.date, "2026-11-01");
  assert.equal(strip[2]?.short, "DOM");
});

test("día elegido: sólo dentro del selector", () => {
  const strip = dayStrip("2026-10-30");
  assert.equal(pickDay("2026-11-02", strip), "2026-11-02");
  assert.equal(pickDay("2026-12-25", strip), "2026-10-30");
  assert.equal(pickDay("2026-02-30", strip), "2026-10-30");
  assert.equal(pickDay(undefined, strip), "2026-10-30");
});

test("fecha larga", () => {
  assert.equal(longDate("2026-10-27"), "Martes 27 de octubre");
});

test("avisos de la clase", () => {
  const base = { status: "scheduled" as const, cancelReason: null, teacherName: "Martina", substituteName: null, fromHoliday: false };
  assert.deepEqual(sessionBadges(base), []);
  assert.deepEqual(sessionBadges({ ...base, substituteName: "Lucía" }), [{ tone: "warn", text: "REEMPLAZO · Prof. Lucía" }]);
  assert.deepEqual(sessionBadges({ ...base, status: "cancelled", cancelReason: "Feriado nacional", fromHoliday: true }), [
    { tone: "alert", text: "SIN CLASE · Feriado nacional" },
  ]);
  assert.equal(sessionBadges({ ...base, status: "cancelled", cancelReason: "Viaje" })[0]?.text, "SUSPENDIDA · Viaje");
  assert.equal(teacherShown(base), "Prof. Martina");
  assert.equal(teacherShown({ teacherName: "Martina", substituteName: "Lucía" }), "Prof. Lucía");
  assert.equal(teacherShown({ teacherName: null, substituteName: null }), "Profe a confirmar");
});

test("feriado: fecha válida, no pasada, con motivo", () => {
  const today = "2026-10-22";
  assert.deepEqual(validateException({ date: "2026-11-23", description: " Día de la  Soberanía ", kind: "holiday" }, today), {
    ok: true,
    value: { date: "2026-11-23", description: "Día de la Soberanía", kind: "holiday" },
  });
  assert.deepEqual(validateException({ date: "2026-10-21", description: "x", kind: "holiday" }, today), { ok: false, error: "fecha-pasada" });
  assert.deepEqual(validateException({ date: "nada", description: "x", kind: "holiday" }, today), { ok: false, error: "fecha" });
  assert.deepEqual(validateException({ date: "2026-11-23", description: "", kind: "closure" }, today), { ok: false, error: "motivo" });
});
