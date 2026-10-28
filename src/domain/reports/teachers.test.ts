import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMonth, shiftMonth, summarizeTeachers, teachersCsv, type ReportSession } from "./teachers.ts";

const base = { groupName: "Coreografía · Infantil", cancelReason: null, ownerId: "agus", ownerName: "Agustina", taughtById: "agus", taughtByName: "Agustina", present: 0 };
const rows: ReportSession[] = [
  { ...base, sessionId: "1", startsAt: "2026-10-06T21:00:00Z", endsAt: "2026-10-06T22:00:00Z", status: "scheduled", present: 8 },
  { ...base, sessionId: "2", startsAt: "2026-10-13T21:00:00Z", endsAt: "2026-10-13T22:30:00Z", status: "scheduled", taughtById: "luli", taughtByName: "Luli", present: 6 },
  { ...base, sessionId: "3", startsAt: "2026-10-20T21:00:00Z", endsAt: "2026-10-20T22:00:00Z", status: "cancelled", cancelReason: "Feriado" },
  { ...base, sessionId: "4", startsAt: "2026-10-27T21:00:00Z", endsAt: "2026-10-27T22:00:00Z", status: "scheduled" },
];
const now = new Date("2026-10-25T12:00:00Z");

test("resumen por profe", () => {
  const [agus, luli] = summarizeTeachers(rows, now);
  assert.equal(agus!.name, "Agustina");
  assert.deepEqual(
    { taught: agus!.taught, replaced: agus!.replaced, cancelled: agus!.cancelled, upcoming: agus!.upcoming, present: agus!.present, hours: agus!.hours },
    { taught: 1, replaced: 1, cancelled: 1, upcoming: 1, present: 8, hours: 1 },
  );
  assert.equal(luli!.name, "Luli");
  assert.deepEqual({ taught: luli!.taught, asSubstitute: luli!.asSubstitute, present: luli!.present, hours: luli!.hours }, { taught: 1, asSubstitute: 1, present: 6, hours: 1.5 });
});

test("meses", () => {
  assert.equal(parseMonth("2026-11", "2026-10-28"), "2026-11-01");
  assert.equal(parseMonth("xx", "2026-10-28"), "2026-10-01");
  assert.equal(parseMonth("2026-13", "2026-10-28"), "2026-10-01");
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01");
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12");
});

test("CSV para Excel", () => {
  const csv = teachersCsv(summarizeTeachers(rows, now), (iso) => iso.slice(0, 10));
  const lines = csv.replace("﻿", "").trim().split("\r\n");
  assert.equal(lines[0], "Profe;Fecha;Clase;Situación;Dada por;Presentes");
  assert.equal(lines.length, 1 + 4 + 1);
  assert.ok(lines.includes("Agustina;2026-10-20;Coreografía · Infantil;Suspendida;Agustina;"));
  assert.ok(lines.includes("Luli;2026-10-13;Coreografía · Infantil;Reemplazo;Luli;6"));
});
