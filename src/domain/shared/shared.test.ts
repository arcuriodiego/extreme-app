import { test } from "node:test";
import assert from "node:assert/strict";
import { formatARS, pesos } from "./money.ts";
import { calendarDateInZone, diffDays, isValidCalendarDate } from "./calendar-date.ts";

test("precios reales en formato argentino", () => {
  assert.equal(formatARS(pesos(55_500)), "$55.500");
  assert.equal(formatARS(pesos(103_000)), "$103.000");
  assert.equal(formatARS(pesos(11_500)), "$11.500");
  assert.equal(formatARS(Math.round(pesos(103_000) / 16)), "$6.437,50");
  assert.equal(formatARS(-120_000), "-$1.200");
});

test("los importes deben ser enteros en centavos", () => {
  assert.throws(() => formatARS(10.5));
});

test("la fecha de la academia sale de la hora de Buenos Aires, no de UTC", () => {
  // 23/10 a las 01:30 UTC es todavía el 22/10 a las 22:30 en Buenos Aires.
  assert.equal(calendarDateInZone(new Date("2026-10-23T01:30:00Z"), "America/Argentina/Buenos_Aires"), "2026-10-22");
});

test("fechas inexistentes se rechazan", () => {
  assert.equal(isValidCalendarDate("2026-02-29"), false);
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(diffDays("2026-12-31", "2027-01-01"), 1);
});
