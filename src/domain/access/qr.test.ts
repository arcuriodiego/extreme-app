import { test } from "node:test";
import assert from "node:assert/strict";
import { accessCode, looksLikeAccessCode, msUntilNextWindow, qrSignature, qrWindow } from "./qr.ts";

test("la firma coincide con la que calcula la base (pgcrypto)", async () => {
  // Valor calculado en PostgreSQL con hmac(convert_to('<id>:<ventana>','UTF8'), clave, 'sha256').
  const sig = await qrSignature("ab".repeat(32), "0b9a3f5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", 58712345);
  assert.equal(sig, "d536d91d3af8e281");
});

test("ventanas de 30 segundos", async () => {
  assert.equal(qrWindow(59_999), 1);
  assert.equal(qrWindow(60_000), 2);
  assert.equal(msUntilNextWindow(65_000), 25_000);
  const code = await accessCode("ab".repeat(32), "0b9a3f5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", 58712345 * 30_000 + 10);
  assert.equal(code, "EDA1.0b9a3f5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.58712345.d536d91d3af8e281");
  assert.equal(looksLikeAccessCode(code), true);
  assert.equal(looksLikeAccessCode("https://otra-cosa.com"), false);
});
