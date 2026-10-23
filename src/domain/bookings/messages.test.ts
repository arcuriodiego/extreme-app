import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOKING_ERRORS, bookingErrorCode } from "./messages.ts";

test("errores de reserva: cada mensaje de la base tiene su texto", () => {
  const cases: [string, string][] = [
    ["No tenés clases disponibles: comprá un pack", "sin-saldo"],
    ["No hay lugar: la clase está completa.", "completa"],
    ["Ya tenés reservada esa clase.", "ya-reservada"],
    ["Esa clase ya es tu clase fija.", "es-fija"],
    ["Esa clase está suspendida.", "suspendida"],
    ["Esa clase ya empezó.", "empezo"],
    ["Esa clase es sólo para alumnos con cuota de profe.", "solo-cuota"],
    ["otra cosa", "generico"],
  ];
  for (const [message, code] of cases) {
    assert.equal(bookingErrorCode({ message }), code);
    assert.ok(BOOKING_ERRORS[code], `falta el texto de ${code}`);
  }
  assert.equal(bookingErrorCode({ code: "42501", message: "x" }), "sin-permiso");
});
