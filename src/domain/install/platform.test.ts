import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPlatform, isInAppBrowser, snoozed } from "./platform.ts";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";

test("detecta celular y navegador", () => {
  assert.equal(detectPlatform(IPHONE_SAFARI), "ios-safari");
  assert.equal(detectPlatform(IPHONE_CHROME), "ios-other");
  assert.equal(detectPlatform(IPHONE_INSTAGRAM), "ios-other");
  assert.equal(detectPlatform(IPAD, 5), "ios-safari");
  assert.equal(detectPlatform(IPAD, 0), "desktop");
  assert.equal(detectPlatform(ANDROID), "android");
  assert.equal(detectPlatform(WINDOWS), "desktop");
  assert.equal(detectPlatform(""), "desktop");
});

test("navegador de Instagram", () => {
  assert.ok(isInAppBrowser(IPHONE_INSTAGRAM));
  assert.ok(!isInAppBrowser(IPHONE_SAFARI));
});

test("ahora no: 7 días", () => {
  const day = 24 * 60 * 60 * 1000;
  assert.ok(snoozed(0, 6 * day));
  assert.ok(!snoozed(0, 8 * day));
  assert.ok(!snoozed(null, 0));
});
