import { test } from "node:test";
import assert from "node:assert/strict";
import { cashSummary, methodLabel, periodLabel, validatePaymentForm } from "./payments.ts";

test("se cobra el total: ni parcial ni de más", () => {
  assert.deepEqual(validatePaymentForm({ amount: "55.500", method: "cash", reference: " " }, 5_550_000), {
    ok: true,
    value: { amountCents: 5_550_000, method: "cash", reference: null },
  });
  assert.deepEqual(validatePaymentForm({ amount: "20000", method: "transfer", reference: "OP-1" }, 5_550_000), { ok: false, error: "monto-distinto" });
  assert.deepEqual(validatePaymentForm({ amount: "60.000", method: "cash", reference: "" }, 5_550_000), { ok: false, error: "monto-distinto" });
  assert.deepEqual(validatePaymentForm({ amount: "", method: "cash", reference: "" }, 5_550_000), { ok: false, error: "monto" });
  assert.deepEqual(validatePaymentForm({ amount: "55500", method: "mp_checkout", reference: "" }, 5_550_000), { ok: false, error: "medio" });
});

test("caja del día: totales por medio sin anulados", () => {
  const s = cashSummary([
    { method: "cash", amountCents: 5_550_000, status: "approved" },
    { method: "cash", amountCents: 1_150_000, status: "approved" },
    { method: "qr", amountCents: 6_600_000, status: "approved" },
    { method: "transfer", amountCents: 9_999_999, status: "void" },
  ]);
  assert.equal(s.total, 13_300_000);
  assert.deepEqual(s.byMethod.map((m) => [m.method, m.cents, m.count]), [
    ["cash", 6_700_000, 2],
    ["qr", 6_600_000, 1],
  ]);
});

test("etiquetas", () => {
  assert.equal(methodLabel("card_pos"), "Tarjeta (posnet)");
  assert.equal(periodLabel("2026-10-10", "2026-11-09"), "10/10 al 9/11");
});
