import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { centsToPesos, isPurchaseKind, pesosToCents, verifyMpSignature } from "./mercadopago.ts";

test("firma de Mercado Pago", () => {
  const secret = "clave-de-prueba";
  const v1 = createHmac("sha256", secret).update("id:123456;request-id:abc-1;ts:1700000000;").digest("hex");
  const ok = { signature: `ts=1700000000,v1=${v1}`, requestId: "abc-1", dataId: "123456", secret };
  assert.equal(verifyMpSignature(ok), true);
  assert.equal(verifyMpSignature({ ...ok, dataId: "999" }), false);
  assert.equal(verifyMpSignature({ ...ok, secret: "otra" }), false);
  assert.equal(verifyMpSignature({ ...ok, signature: "ts=1700000000" }), false);
  assert.equal(verifyMpSignature({ ...ok, signature: null }), false);
});

test("pesos y centavos", () => {
  assert.equal(centsToPesos(7_540_000), 75_400);
  assert.equal(pesosToCents(75_400), 7_540_000);
  assert.equal(pesosToCents(13_600.5), 1_360_050);
  assert.ok(isPurchaseKind("pack"));
  assert.ok(!isPurchaseKind("regalo"));
});
