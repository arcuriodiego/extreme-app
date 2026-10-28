import { test } from "node:test";
import assert from "node:assert/strict";
import { billingPeriod, dueDateOf, graceEndDate, membershipLight, membershipGrantsAccess } from "./membership-cycle.ts";

const cuota = 5_550_000; // $55.500 en centavos

test("paga el 10/10 y vence el 10/11, después el 10/12", () => {
  assert.equal(dueDateOf("2026-10-10", 1), "2026-11-10");
  assert.equal(dueDateOf("2026-10-10", 2), "2026-12-10");
  assert.deepEqual(billingPeriod("2026-10-10", 0), {
    index: 0, start: "2026-10-10", end: "2026-11-09", nextDueDate: "2026-11-10",
  });
});

test("primer pago el 31: vence el último día de los meses cortos y vuelve al 31", () => {
  assert.equal(dueDateOf("2026-01-31", 1), "2026-02-28");
  assert.equal(dueDateOf("2026-01-31", 2), "2026-03-31");
  assert.equal(dueDateOf("2026-01-31", 3), "2026-04-30");
  assert.equal(dueDateOf("2026-01-31", 4), "2026-05-31");
});

test("año bisiesto: el 29 de febrero existe en 2028", () => {
  assert.equal(dueDateOf("2028-01-30", 1), "2028-02-29");
  assert.equal(dueDateOf("2028-01-30", 2), "2028-03-30");
});

test("cambio de año: vence en diciembre y sigue en enero", () => {
  assert.equal(dueDateOf("2026-11-15", 1), "2026-12-15");
  assert.equal(dueDateOf("2026-11-15", 2), "2027-01-15");
});

test("la gracia de un vencimiento el 10 termina el 15", () => {
  assert.equal(graceEndDate("2026-11-10"), "2026-11-15");
});

const unpaid = [{ dueDate: "2026-11-10", totalCents: cuota, paidCents: 0 }];

test("día del vencimiento: sigue al día (verde)", () => {
  const s = membershipLight({ today: "2026-11-10", charges: unpaid, nextDueDate: "2026-11-10" });
  assert.equal(s.light, "current");
});

test("primer día de gracia (11): amarillo, 5 días restantes, con acceso", () => {
  const s = membershipLight({ today: "2026-11-11", charges: unpaid, nextDueDate: null });
  assert.equal(s.light, "grace");
  assert.equal(s.light === "grace" && s.daysLeft, 5);
  assert.equal(membershipGrantsAccess(s), true);
});

test("quinto día de gracia (15): amarillo, último día", () => {
  const s = membershipLight({ today: "2026-11-15", charges: unpaid, nextDueDate: null });
  assert.equal(s.light, "grace");
  assert.equal(s.light === "grace" && s.daysLeft, 1);
});

test("sexto día después del vencimiento (16): rojo, sin acceso", () => {
  const s = membershipLight({ today: "2026-11-16", charges: unpaid, nextDueDate: null });
  assert.equal(s.light, "suspended");
  assert.equal(s.light === "suspended" && s.suspendedSince, "2026-11-16");
  assert.equal(membershipGrantsAccess(s), false);
});

test("pago parcial no restablece el acceso", () => {
  const partial = [{ dueDate: "2026-11-10", totalCents: cuota, paidCents: 3_000_000 }];
  const s = membershipLight({ today: "2026-11-20", charges: partial, nextDueDate: null });
  assert.equal(s.light, "suspended");
  assert.equal(s.light === "suspended" && s.amountDueCents, 2_550_000);
});

test("pago total tardío: vuelve a verde", () => {
  const paid = [{ dueDate: "2026-11-10", totalCents: cuota, paidCents: cuota }];
  const s = membershipLight({ today: "2026-11-20", charges: paid, nextDueDate: "2026-12-10" });
  assert.deepEqual(s, { light: "current", nextDueDate: "2026-12-10" });
});

test("dos cuotas impagas: manda la más antigua y suma la deuda", () => {
  const two = [
    { dueDate: "2026-12-10", totalCents: cuota, paidCents: 0 },
    { dueDate: "2026-11-10", totalCents: cuota, paidCents: 0 },
  ];
  const s = membershipLight({ today: "2026-12-11", charges: two, nextDueDate: null });
  assert.equal(s.light, "suspended");
  assert.equal(s.light === "suspended" && s.dueDate, "2026-11-10");
  assert.equal(s.light === "suspended" && s.amountDueCents, 2 * cuota);
});

test("los días de gracia son configurables", () => {
  const s = membershipLight({ today: "2026-11-14", charges: unpaid, nextDueDate: null, graceDays: 3 });
  assert.equal(s.light, "suspended");
});

test("con precio en efectivo, también dice cuánto es en efectivo", () => {
  const light = membershipLight({
    today: "2026-11-12",
    graceDays: 5,
    nextDueDate: null,
    charges: [{ dueDate: "2026-11-10", totalCents: 6_776_000, paidCents: 0, cashCents: 5_600_000 }],
  });
  if (light.light !== "grace") throw new Error(`esperaba gracia, vino ${light.light}`);
  assert.equal(light.amountDueCents, 6_776_000);
  assert.equal(light.cashDueCents, 5_600_000);
});
