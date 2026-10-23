import { test } from "node:test";
import assert from "node:assert/strict";
import { monthRows, occupancy, percentChange } from "./summary.ts";

test("variación contra el mes anterior", () => {
  assert.equal(percentChange(120, 100), 20);
  assert.equal(percentChange(80, 100), -20);
  assert.equal(percentChange(50, 0), null);
});

test("ocupación de la clase", () => {
  assert.equal(occupancy(3, 2, 20), 25);
  assert.equal(occupancy(20, 5, 20), 100);
  assert.equal(occupancy(0, 0, 0), 0);
});

test("ingresos del mes por concepto", () => {
  const m = monthRows({ pack: 6_600_000, membership: 11_100_000, workshop: 0 }, 1_000_000);
  assert.deepEqual(m.rows.map((r) => r.label), ["Cuotas de profe", "Packs"]);
  assert.equal(m.net, 16_700_000);
});
