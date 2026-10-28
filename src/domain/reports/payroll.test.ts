import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollCsv, summarizePayroll, type PayrollLine } from "./payroll.ts";

const l = (p: Partial<PayrollLine>): PayrollLine => ({
  teacherId: "agus",
  teacherName: "Agustina",
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
  assert.equal(rows[1], "Agustina;2026-10-10;Cuota de profe;Vale P;Cuota oct;56000,00;28000,00");
  assert.equal(rows[2], "Total Agustina;;;;;;28000,00");
});
