import { test } from "node:test";
import assert from "node:assert/strict";
import { cancellationOutcome, creditWindow, canUseCredit } from "./cancellation.ts";

// Clase el jueves 23/10/2026 a las 20:00 de Buenos Aires (23:00 UTC).
const clase = new Date("2026-10-23T23:00:00Z");
const hoursBefore = (h: number) => new Date(clase.getTime() - h * 3_600_000);

test("cancelación con más de 12 h: devuelve un crédito (clase individual)", () => {
  const r = cancellationOutcome({ sessionStartsAt: clase, cancelledAt: hoursBefore(20), payKind: "single" });
  assert.deepEqual(r, { refunded: true, returnsTo: "new_credit", hoursBefore: 20 });
});

test("cancelación exactamente 12 h antes: también devuelve", () => {
  const r = cancellationOutcome({ sessionStartsAt: clase, cancelledAt: hoursBefore(12), payKind: "single" });
  assert.equal(r.refunded, true);
});

test("cancelación con menos de 12 h (11:59): no devuelve", () => {
  const r = cancellationOutcome({ sessionStartsAt: clase, cancelledAt: hoursBefore(11 + 59 / 60), payKind: "single" });
  assert.equal(r.refunded, false);
  assert.equal(!r.refunded && r.reason, "too_late");
});

test("con pack, la clase vuelve al pack", () => {
  const r = cancellationOutcome({ sessionStartsAt: clase, cancelledAt: hoursBefore(24), payKind: "pack" });
  assert.equal(r.refunded && r.returnsTo, "pack");
});

test("una clase ya empezada no se puede cancelar con devolución", () => {
  const r = cancellationOutcome({ sessionStartsAt: clase, cancelledAt: hoursBefore(-0.5), payKind: "pack" });
  assert.equal(!r.refunded && r.reason, "already_started");
});

const generado = new Date("2026-10-20T15:00:00Z");
const credito = creditWindow(generado);
const at = (days: number) => new Date(generado.getTime() + days * 86_400_000);

test("el crédito se puede usar dentro de los 5 días", () => {
  assert.deepEqual(canUseCredit({ credit: credito, alreadyUsed: false, bookingAt: at(4), sessionStartsAt: at(10) }), { ok: true });
});

test("crédito vencido (día 6): no se puede reservar", () => {
  const r = canUseCredit({ credit: credito, alreadyUsed: false, bookingAt: at(6), sessionStartsAt: at(7) });
  assert.deepEqual(r, { ok: false, reason: "expired" });
});

test("la clase puede ser hasta 14 días después, no más", () => {
  assert.equal(canUseCredit({ credit: credito, alreadyUsed: false, bookingAt: at(1), sessionStartsAt: at(14) }).ok, true);
  assert.deepEqual(
    canUseCredit({ credit: credito, alreadyUsed: false, bookingAt: at(1), sessionStartsAt: at(14.01) }),
    { ok: false, reason: "class_too_far" },
  );
});

test("un crédito no se usa dos veces", () => {
  const r = canUseCredit({ credit: credito, alreadyUsed: true, bookingAt: at(1), sessionStartsAt: at(2) });
  assert.deepEqual(r, { ok: false, reason: "already_used" });
});
