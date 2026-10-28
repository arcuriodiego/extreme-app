import { test } from "node:test";
import assert from "node:assert/strict";
import { PRODUCTION_URL, appEnv, appUrl, installName } from "./app-env.ts";

test("sin variable o con cualquier otro valor es producción", () => {
  assert.equal(appEnv(undefined), "production");
  assert.equal(appEnv(""), "production");
  assert.equal(appEnv("production"), "production");
  assert.equal(appEnv("prueba"), "production");
  assert.equal(appEnv(" Staging "), "staging");
});

test("dirección pública: limpia la barra final y rechaza valores raros", () => {
  assert.equal(appUrl(undefined), PRODUCTION_URL);
  assert.equal(appUrl("https://pruebas.extremedance.com.ar/"), "https://pruebas.extremedance.com.ar");
  assert.equal(appUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(appUrl("http://pruebas.extremedance.com.ar"), PRODUCTION_URL);
  assert.equal(appUrl("https://pruebas.extremedance.com.ar/inicio"), PRODUCTION_URL);
  assert.equal(appUrl("javascript:alert(1)"), PRODUCTION_URL);
});

test("nombre al instalar", () => {
  assert.equal(installName("Extreme Dance", "production"), "Extreme Dance");
  assert.equal(installName("Extreme Dance", "staging"), "Extreme Dance PRUEBAS");
});
