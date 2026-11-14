import { test } from "node:test";
import assert from "node:assert/strict";
import { cashDue, nonCashPrice, otherPrice, pricePair } from "./cash-price.ts";

test("otros medios = efectivo + recargo, en pesos enteros", () => {
  assert.equal(nonCashPrice(5_600_000, 21), 6_776_000);
  assert.equal(nonCashPrice(5_550_000, 21), 6_715_500);
  assert.equal(nonCashPrice(1_150_050, 21), 1_391_600);
  assert.equal(nonCashPrice(5_600_000, 0), 5_600_000);
});

test("par de precios", () => {
  assert.deepEqual(pricePair(5_600_000, 21), { list: 6_776_000, cash: 5_600_000 });
  assert.deepEqual(pricePair(5_600_000, 0), { list: 5_600_000, cash: null });
});

test("precio con otros medios cargado a mano (precios de enero 2027)", () => {
  assert.equal(otherPrice(5_900_000, 21, 6_400_000), 6_400_000);
  assert.equal(otherPrice(5_900_000, 21, null), 7_139_000);
  assert.equal(otherPrice(5_900_000, 21), 7_139_000);
  assert.deepEqual(pricePair(1_260_000, 21, 1_350_000), { list: 1_350_000, cash: 1_260_000 });
  assert.deepEqual(pricePair(1_260_000, 21, 1_260_000), { list: 1_260_000, cash: null });
});

test("en efectivo, sólo si no tiene pagos", () => {
  assert.equal(cashDue({ cashCents: 5_600_000, paidCents: 0, pendingCents: 6_776_000 }), 5_600_000);
  assert.equal(cashDue({ cashCents: 5_600_000, paidCents: 100, pendingCents: 6_775_900 }), null);
  assert.equal(cashDue({ cashCents: null, paidCents: 0, pendingCents: 5_550_000 }), null);
  assert.equal(cashDue({ cashCents: 5_550_000, paidCents: 0, pendingCents: 5_550_000 }), null);
});
