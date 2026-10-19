import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSignIn, validateSignUp, validateNewPassword, validateProfile, normalizeEmail } from "./validation.ts";
import { routeAccess, safeNextPath } from "./routes.ts";
import { authErrorMessage, GENERIC_AUTH_ERROR } from "./errors.ts";

const ok = { firstName: "Valentina", lastName: "Rodríguez", email: "vale@example.com", password: "baile2026", passwordConfirm: "baile2026" };

test("registro válido no tiene errores", () => {
  assert.equal(validateSignUp(ok), null);
});

test("nombres con acentos, ñ, apóstrofo y guion son válidos", () => {
  assert.equal(validateSignUp({ ...ok, firstName: "María José", lastName: "Peña-O'Connor" }), null);
});

test("registro: contraseña corta, sin número y que no coincide", () => {
  assert.equal(validateSignUp({ ...ok, password: "abc1", passwordConfirm: "abc1" })?.password, "La contraseña necesita al menos 8 caracteres.");
  assert.equal(validateSignUp({ ...ok, password: "soloLetras", passwordConfirm: "soloLetras" })?.password, "Usá al menos una letra y un número.");
  assert.equal(validateSignUp({ ...ok, passwordConfirm: "otra2026" })?.passwordConfirm, "Las contraseñas no coinciden.");
});

test("registro: campos vacíos y email inválido", () => {
  const e = validateSignUp({ firstName: "", lastName: "", email: "vale@", password: "", passwordConfirm: "" });
  assert.equal(e?.firstName, "Ingresá tu nombre.");
  assert.equal(e?.lastName, "Ingresá tu apellido.");
  assert.equal(e?.email, "Revisá el email: parece incompleto.");
  assert.equal(e?.password, "Ingresá una contraseña.");
});

test("el email se normaliza en minúsculas y sin espacios", () => {
  assert.equal(normalizeEmail("  Vale@Example.COM "), "vale@example.com");
});

test("ingreso: pide email y contraseña", () => {
  assert.deepEqual(validateSignIn({ email: "", password: "" }), { email: "Ingresá tu email.", password: "Ingresá tu contraseña." });
  assert.equal(validateSignIn({ email: "vale@example.com", password: "x" }), null);
});

test("nueva contraseña", () => {
  assert.equal(validateNewPassword({ password: "nueva2026", passwordConfirm: "nueva2026" }), null);
  assert.ok(validateNewPassword({ password: "nueva2026", passwordConfirm: "nueva2025" }));
});

test("perfil: teléfono y fecha de nacimiento opcionales pero válidos", () => {
  const base = { firstName: "Vale", lastName: "Rodríguez", phone: "", birthDate: "" };
  assert.equal(validateProfile(base, "2026-10-19"), null);
  assert.equal(validateProfile({ ...base, phone: "+54 9 11 5555-4210", birthDate: "1998-03-14" }, "2026-10-19"), null);
  assert.ok(validateProfile({ ...base, phone: "abc" }, "2026-10-19")?.phone);
  assert.equal(validateProfile({ ...base, birthDate: "2027-01-01" }, "2026-10-19")?.birthDate, "La fecha de nacimiento no puede ser futura.");
  assert.equal(validateProfile({ ...base, birthDate: "2026-02-30" }, "2026-10-19")?.birthDate, "Revisá la fecha de nacimiento.");
});

test("rutas protegidas, sólo para visitantes y públicas", () => {
  assert.equal(routeAccess("/inicio"), "protected");
  assert.equal(routeAccess("/perfil"), "protected");
  assert.equal(routeAccess("/nueva-clave"), "protected");
  assert.equal(routeAccess("/inicio/pagos"), "protected");
  assert.equal(routeAccess("/inicios"), "public");
  assert.equal(routeAccess("/ingresar"), "guest-only");
  assert.equal(routeAccess("/registro"), "guest-only");
  assert.equal(routeAccess("/"), "public");
  assert.equal(routeAccess("/recuperar"), "public");
  assert.equal(routeAccess("/auth/confirm"), "public");
});

test("redirección segura: sólo rutas internas", () => {
  assert.equal(safeNextPath("/perfil"), "/perfil");
  assert.equal(safeNextPath("/inicio?tab=pagos"), "/inicio?tab=pagos");
  assert.equal(safeNextPath("https://sitio-falso.com"), null);
  assert.equal(safeNextPath("//sitio-falso.com"), null);
  assert.equal(safeNextPath("/\\sitio-falso.com"), null);
  assert.equal(safeNextPath("perfil"), null);
  assert.equal(safeNextPath(null), null);
});

test("errores de Supabase en español y sin detalles técnicos", () => {
  assert.equal(authErrorMessage({ code: "invalid_credentials" }), "El email o la contraseña no son correctos.");
  assert.equal(authErrorMessage({ status: 429 }), "Hubo demasiados intentos seguidos. Esperá unos minutos y volvé a intentar.");
  assert.equal(authErrorMessage({ code: "algo_nuevo", message: "Internal error xyz" }), GENERIC_AUTH_ERROR);
});
