import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { bucketFor, checkImage, clampOffset, cropSquare, fitWithin, imagePath, initials, isImagePath, publicImageUrl } from "./images.ts";

const A = "11111111-1111-1111-1111-111111111111";
const W = "22222222-2222-2222-2222-222222222222";

test("acepta jpg, png y webp de hasta 3 MB", () => {
  assert.deepEqual(checkImage({ size: 200_000, type: "image/jpeg" }), { ok: true, type: "image/jpeg" });
  assert.deepEqual(checkImage({ size: 10, type: "image/webp" }), { ok: true, type: "image/webp" });
  assert.deepEqual(checkImage({ size: 0, type: "image/jpeg" }), { ok: false, error: "imagen-vacia" });
  assert.deepEqual(checkImage(null), { ok: false, error: "imagen-vacia" });
  assert.deepEqual(checkImage({ size: 10, type: "image/gif" }), { ok: false, error: "imagen-tipo" });
  assert.deepEqual(checkImage({ size: 10, type: "application/pdf" }), { ok: false, error: "imagen-tipo" });
  assert.deepEqual(checkImage({ size: 4 * 1024 * 1024, type: "image/png" }), { ok: false, error: "imagen-pesada" });
});

test("arma y reconoce la ruta", () => {
  const p = imagePath(A, "workshops", W, "abcDEF12_-", "image/jpeg");
  assert.equal(p, `${A}/workshops/${W}/abcDEF12_-.jpg`);
  assert.ok(isImagePath(p));
  assert.ok(isImagePath(p, "workshops"));
  assert.ok(!isImagePath(p, "profes"));
  assert.ok(!isImagePath(`${A}/workshops/${W}/../x.jpg`));
  assert.ok(!isImagePath(`${A}/otros/${W}/abcdefgh.jpg`));
  assert.ok(!isImagePath(`${A}/workshops/${W}/abcdefgh.gif`));
});

test("dirección pública", () => {
  const p = imagePath(A, "profes", W, "abcdefgh", "image/webp");
  assert.equal(publicImageUrl("https://x.supabase.co/", p), `https://x.supabase.co/storage/v1/object/public/imagenes/${p}`);
  assert.equal(publicImageUrl("https://x.supabase.co", null), null);
  assert.equal(publicImageUrl("https://x.supabase.co", "cualquier/cosa.jpg"), null);
});

test("achica sin deformar ni agrandar", () => {
  assert.deepEqual(fitWithin(4032, 3024, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(1080, 1350, 1600), { width: 1080, height: 1350 });
  assert.deepEqual(fitWithin(3000, 4000, 600), { width: 450, height: 600 });
});

test("iniciales", () => {
  assert.equal(initials("Agustina"), "A");
  assert.equal(initials("  mati  napp "), "MN");
  assert.equal(initials("Ana María López"), "AM");
  assert.equal(initials(""), "");
});

test("documentos: PDF o imágenes de hasta 4 MB", async () => {
  const { checkDocument } = await import("./images.ts");
  assert.deepEqual(checkDocument({ size: 3_000_000, type: "application/pdf" }), { ok: true, type: "application/pdf" });
  assert.deepEqual(checkDocument({ size: 5 * 1024 * 1024, type: "application/pdf" }), { ok: false, error: "archivo-pesado" });
  assert.deepEqual(checkDocument({ size: 10, type: "application/msword" }), { ok: false, error: "archivo-tipo" });
  assert.deepEqual(checkDocument(null), { ok: false, error: "archivo-vacio" });
});

test("fotos de alumnos: ruta propia, bucket privado y nunca enlace público", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const S = "22222222-2222-4222-8222-222222222222";
  const p = imagePath(A, "alumnos", S, "abcdefgh12", "image/jpeg");
  assert.equal(p, `${A}/alumnos/${S}/abcdefgh12.jpg`);
  assert.ok(isImagePath(p, "alumnos"));
  assert.equal(bucketFor("alumnos"), "fotos");
  assert.equal(bucketFor("profes"), "imagenes");
  assert.equal(publicImageUrl("https://x.supabase.co", p), null);
});

describe("encuadre de fotos redondas", () => {
  it("sin mover ni agrandar, toma el cuadrado del centro", () => {
    assert.deepEqual(cropSquare(1200, 800, 240, 1, { x: 0, y: 0 }), { x: 200, y: 0, size: 800 });
    assert.deepEqual(cropSquare(800, 1200, 240, 1, { x: 0, y: 0 }), { x: 0, y: 200, size: 800 });
  });
  it("mover la foto a la derecha muestra la parte izquierda, hasta el borde", () => {
    // escala 240/800 = 0,3: 30 px en pantalla son 100 px de la foto
    assert.deepEqual(cropSquare(1200, 800, 240, 1, { x: 30, y: 0 }), { x: 100, y: 0, size: 800 });
    assert.deepEqual(cropSquare(1200, 800, 240, 1, { x: 999, y: 0 }), { x: 0, y: 0, size: 800 });
    assert.deepEqual(cropSquare(1200, 800, 240, 1, { x: -999, y: 0 }), { x: 400, y: 0, size: 800 });
  });
  it("no deja mover hacia donde no sobra foto", () => {
    assert.deepEqual(clampOffset(1200, 800, 240, 1, { x: 0, y: 50 }), { x: 0, y: 0 });
  });
  it("al agrandar toma un cuadrado más chico y se puede mover en los dos sentidos", () => {
    const c = cropSquare(1200, 800, 240, 2, { x: 0, y: 0 });
    assert.deepEqual(c, { x: 400, y: 200, size: 400 });
    assert.deepEqual(clampOffset(1200, 800, 240, 2, { x: 0, y: 500 }), { x: 0, y: 120 });
    assert.deepEqual(cropSquare(1200, 800, 240, 2, { x: 0, y: 120 }), { x: 400, y: 0, size: 400 });
  });
});
