import { test } from "node:test";
import assert from "node:assert/strict";
import { ageOn, validateStudent } from "./student.ts";
import { nextChange, parsePesos, priceOn } from "../billing/prices.ts";

const today = "2026-10-22";
const base = { firstName: " Juana ", lastName: "Pérez", dni: "50.123.456", birthDate: "2015-06-01", phone: "", status: "trial" };

test("ficha válida: limpia el DNI y los espacios", () => {
  assert.deepEqual(validateStudent(base, today), {
    ok: true,
    value: { firstName: "Juana", lastName: "Pérez", dni: "50123456", birthDate: "2015-06-01", phone: null, status: "trial" },
  });
});

test("ficha inválida: mensajes por campo", () => {
  const r = validateStudent({ ...base, firstName: "", dni: "12", birthDate: "2030-01-01", phone: "abc", status: "x" }, today);
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["birthDate", "dni", "firstName", "phone", "status"]);
});

test("alumno con cuenta: el nombre no se valida ni se pide", () => {
  assert.equal(validateStudent({ ...base, firstName: "" }, today, { withName: false, withPhone: false }).ok, true);
});

test("edad cumplida", () => {
  assert.equal(ageOn("2015-06-01", "2026-05-31"), 10);
  assert.equal(ageOn("2015-06-01", "2026-06-01"), 11);
});

test("importes escritos a mano", () => {
  assert.equal(parsePesos("55500"), 5_550_000);
  assert.equal(parsePesos("55.500"), 5_550_000);
  assert.equal(parsePesos("$ 103.000"), 10_300_000);
  assert.equal(parsePesos("11.500,5"), 1_150_050);
  assert.equal(parsePesos("0"), null);
  assert.equal(parsePesos("55,500.00"), null);
  assert.equal(parsePesos("diez"), null);
});

test("precio vigente y próximo cambio", () => {
  const prices = [
    { id: "a", amountCents: 5_550_000, validFrom: "2026-10-22" },
    { id: "b", amountCents: 6_000_000, validFrom: "2026-12-01" },
  ];
  assert.equal(priceOn(prices, "2026-11-30")?.id, "a");
  assert.equal(priceOn(prices, "2026-12-01")?.id, "b");
  assert.equal(priceOn(prices, "2026-10-01"), null);
  assert.equal(nextChange(prices, "2026-10-22")?.id, "b");
  assert.equal(nextChange(prices, "2026-12-01"), null);
});
