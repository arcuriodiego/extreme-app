import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptMessage, reminderMessage, transferLines, whatsappLink, whatsappNumber } from "./whatsapp.ts";

test("teléfonos argentinos a formato de WhatsApp", () => {
  assert.equal(whatsappNumber("223 15 512-3456"), "5492235123456");
  assert.equal(whatsappNumber("0223 5123456"), "5492235123456");
  assert.equal(whatsappNumber("+54 9 223 512 3456"), "5492235123456");
  assert.equal(whatsappNumber("2235123456"), "5492235123456");
  assert.equal(whatsappNumber("011 15 4444-5555"), "5491144445555");
  assert.equal(whatsappNumber("54 11 4444 5555"), "5491144445555");
  assert.equal(whatsappNumber("2266 15 41-2345"), "5492266412345");
  assert.equal(whatsappNumber("12345"), null);
  assert.equal(whatsappNumber(""), null);
  assert.equal(whatsappNumber(null), null);
});

test("enlace wa.me con texto; sin número deja elegir el contacto", () => {
  assert.equal(whatsappLink("2235123456", "Hola ¿todo bien?"), "https://wa.me/5492235123456?text=Hola%20%C2%BFtodo%20bien%3F");
  assert.equal(whatsappLink("123", "Hola"), "https://wa.me/?text=Hola");
});

test("datos para transferir: sólo los cargados", () => {
  assert.deepEqual(transferLines({ alias: "extreme.dance", cbu: null, holder: "Extreme Dance", bank: null }), [
    "Alias: extreme.dance",
    "Titular: Extreme Dance",
  ]);
  assert.deepEqual(transferLines({ alias: null, cbu: null, holder: "X", bank: "Y" }), []);
  assert.deepEqual(transferLines(null), []);
});

test("mensaje del recibo", () => {
  const text = receiptMessage({
    academy: "Extreme Dance Academy",
    contactName: "Laura Pérez",
    number: 12,
    studentNames: ["Valentina Pérez", "Mora Pérez"],
    totalCents: 10_000_000,
    url: "https://app.extremedance.com.ar/recibo/abc",
  });
  assert.match(text, /^¡Hola, Laura! Te mandamos el recibo N° 12 de Extreme Dance Academy \(Valentina y Mora\) por \$100\.000\./);
  assert.match(text, /https:\/\/app\.extremedance\.com\.ar\/recibo\/abc/);
});

test("recordatorio de una familia con dos cuotas y transferencia", () => {
  const text = reminderMessage({
    academy: "Extreme Dance Academy",
    contactName: "Laura Pérez",
    today: "2026-11-10",
    appUrl: "https://app.extremedance.com.ar",
    transfer: { alias: "extreme.dance", cbu: null, holder: null, bank: null },
    charges: [
      { studentName: "Valentina Pérez", description: "Cuota noviembre", dueDate: "2026-11-05", totalCents: 6_050_000, cashCents: 5_000_000 },
      { studentName: "Mora Pérez", description: "Cuota noviembre", dueDate: "2026-11-12", totalCents: 5_000_000, cashCents: null },
    ],
  });
  assert.match(text, /^¡Hola, Laura! Te escribimos de Extreme Dance Academy para recordarte las cuotas:/);
  assert.match(text, /• Valentina · Cuota noviembre: \$50\.000 en efectivo o \$60\.500 con otros medios \(venció el 5\/11\)/);
  assert.match(text, /• Mora · Cuota noviembre: \$50\.000 \(vence el 12\/11\)/);
  assert.match(text, /Alias: extreme\.dance/);
  assert.match(text, /Si ya pagaste, desestimá este mensaje/);
});

test("recordatorio sin datos de transferencia ni nombre", () => {
  const text = reminderMessage({
    academy: "Extreme Dance Academy",
    contactName: null,
    today: "2026-11-10",
    appUrl: "https://app.extremedance.com.ar",
    transfer: null,
    charges: [{ studentName: "Mora", description: "Cuota", dueDate: "2026-11-10", totalCents: 5_000_000, cashCents: null }],
  });
  assert.match(text, /^¡Hola! .*recordarte la cuota:/);
  assert.match(text, /\(vence hoy\)/);
  assert.doesNotMatch(text, /transferir/);
});
