import { test } from "node:test";
import assert from "node:assert/strict";
import { EDITABLE_RULES, validateRules } from "./rules.ts";

const current = { grace_days: 5, credit_days: 5, credit_class_window_days: 14, cancel_hours: 12 };

test("sólo devuelve lo que cambió", () => {
  assert.deepEqual(validateRules({ grace_days: "6", cancel_hours: "12" }, current), { ok: true, changed: { grace_days: 6 } });
});

test("rango y números enteros", () => {
  assert.deepEqual(validateRules({ grace_days: "40" }, current), { ok: false, key: "grace_days", error: "rango" });
  assert.deepEqual(validateRules({ grace_days: "5,5" }, current), { ok: false, key: "grace_days", error: "numero" });
});

test("la clase del crédito no puede ser antes que el plazo para reservarla", () => {
  assert.deepEqual(validateRules({ credit_days: "20" }, current), { ok: false, key: "credit_class_window_days", error: "credito" });
});

test("cada regla tiene un rango válido", () => {
  for (const r of EDITABLE_RULES) assert.ok(r.min <= r.max, r.key);
});
