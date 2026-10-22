import { test } from "node:test";
import assert from "node:assert/strict";
import { seatsLabel, seatsLeft, validateSelection } from "./seats.ts";

test("lugares libres", () => {
  assert.equal(seatsLeft(20, 12), 8);
  assert.equal(seatsLeft(20, 25), 0);
  assert.equal(seatsLabel(20, 20), "Completo");
  assert.equal(seatsLabel(20, 19), "Queda 1 lugar");
  assert.equal(seatsLabel(20, 5), "Quedan 15 lugares");
});

test("elección de horarios de la cuota", () => {
  const offered = ["mar", "jue", "vie"];
  assert.deepEqual(validateSelection(["mar", "jue"], 2, offered), { ok: true, value: ["mar", "jue"] });
  assert.deepEqual(validateSelection(["mar"], 2, offered), { ok: false, error: "cantidad" });
  assert.deepEqual(validateSelection(["mar", "jue", "vie"], 2, offered), { ok: false, error: "cantidad" });
  assert.deepEqual(validateSelection(["mar", "mar"], 2, offered), { ok: false, error: "repetido" });
  assert.deepEqual(validateSelection(["mar", "lun"], 2, offered), { ok: false, error: "no-ofrecido" });
});
