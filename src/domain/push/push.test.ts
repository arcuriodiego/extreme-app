import { test } from "node:test";
import assert from "node:assert/strict";
import { base64UrlToBytes, bytesToBase64Url, isGoneStatus, isVapidPublicKey, pushPayload, safeAppPath } from "./push.ts";

const KEY = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";

test("contenido de la notificación", () => {
  const p = pushPayload({ id: "n1", title: "Tu cuota vence el 10/11", body: "Son $58.800, o $56.000 en efectivo.", link: "/pagos" });
  assert.deepEqual(p, { title: "Tu cuota vence el 10/11", body: "Son $58.800, o $56.000 en efectivo.", url: "/pagos", tag: "aviso-n1" });
  assert.equal(pushPayload({ id: "x", title: "t", body: "a".repeat(400), link: null }).body.length, 238);
  assert.equal(safeAppPath("https://otro.com"), "/avisos");
  assert.equal(safeAppPath("/admin/inscripciones"), "/admin/inscripciones");
});

test("claves", () => {
  assert.ok(isVapidPublicKey(KEY));
  assert.ok(!isVapidPublicKey("abc"));
  assert.ok(!isVapidPublicKey(undefined));
  assert.equal(bytesToBase64Url(base64UrlToBytes(KEY)), KEY);
});

test("suscripción vencida", () => {
  assert.ok(isGoneStatus(410));
  assert.ok(isGoneStatus(404));
  assert.ok(!isGoneStatus(500));
});
