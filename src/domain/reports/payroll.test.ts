import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollCsv, summarizePayroll, type PayrollLine } from "./payroll.ts";

const l = (p: Partial<PayrollLine>): PayrollLine => ({
  teacherId: "agus",
  teacherName: "Agustina",
  payPeriod: "month",
  concept: "cuota",
  occurredAt: "2026-10-10T15:00:00Z",
  studentName: "Vale P",
  detail: "Cuota oct",
  baseCents: 5_600_000,
  shareCents: 2_800_000,
  ...p,
});

test("totales por profe y concepto", () => {
  const [agus, luli] = summarizePayroll([
    l({}),
    l({ concept: "suelta", baseCents: 1_150_000, shareCents: 575_000 }),
    l({ teacherId: "luli", teacherName: "Luli", concept: "pack", baseCents: 660_000, shareCents: 330_000 }),
  ]);
  assert.equal(agus!.totalCents, 3_375_000);
  assert.deepEqual(agus!.byConcept.cuota, { count: 1, cents: 2_800_000 });
  assert.deepEqual(agus!.byConcept.suelta, { count: 1, cents: 575_000 });
  assert.equal(luli!.byConcept.pack.count, 1);
});

test("CSV", () => {
  const csv = payrollCsv(summarizePayroll([l({})]), (iso) => iso.slice(0, 10));
  const rows = csv.replace("﻿", "").trim().split("\r\n");
  assert.equal(rows[1], "Agustina;Mes completo;2026-10-10;1ª;Cuota de profe;Vale P;Cuota oct;56000,00;28000,00");
  assert.equal(rows[2], "Total Agustina;;;;;;;;28000,00");
});

test("quincenas", () => {
  const [luli] = summarizePayroll([
    l({ teacherId: "luli", teacherName: "Luli", payPeriod: "fortnight", occurredAt: "2026-10-15T22:00:00Z", shareCents: 100 }),
    l({ teacherId: "luli", teacherName: "Luli", payPeriod: "fortnight", occurredAt: "2026-10-16T22:00:00Z", shareCents: 200 }),
  ]);
  assert.deepEqual(luli!.halves, { first: 100, second: 200 });
  assert.equal(luli!.payPeriod, "fortnight");
  // En la hora de Argentina, el 16/10 01:00 UTC todavía es el 15.
  const [x] = summarizePayroll([l({ occurredAt: "2026-10-16T01:00:00Z", shareCents: 50 })], () => 15);
  assert.deepEqual(x!.halves, { first: 50, second: 0 });
});
