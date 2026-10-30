import { test } from "node:test";
import assert from "node:assert/strict";
import { cronAuthorized } from "./auth.ts";

const SECRET = "un-secreto-bien-largo-123";

test("acepta sólo el secreto exacto", () => {
  assert.equal(cronAuthorized(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(cronAuthorized(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(cronAuthorized(`bearer ${SECRET}`, SECRET), false);
  assert.equal(cronAuthorized(SECRET, SECRET), false);
  assert.equal(cronAuthorized(null, SECRET), false);
});

test("sin secreto configurado o muy corto, nada pasa", () => {
  assert.equal(cronAuthorized("Bearer ", undefined), false);
  assert.equal(cronAuthorized("Bearer abc", "abc"), false);
  assert.equal(cronAuthorized("Bearer ", ""), false);
});
