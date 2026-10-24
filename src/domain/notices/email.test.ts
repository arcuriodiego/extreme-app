import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeEmail } from "./email.ts";

test("email de un aviso: escapa el contenido y enlaza a la app", () => {
  const e = noticeEmail(
    { firstName: "Vale", title: "Tu cuota vence el lunes 03/11", body: "Son $55.500 <b>hoy</b>.", link: "/pagos" },
    "https://app.extremedance.com.ar",
    "Extreme Dance Academy",
  );
  assert.equal(e.subject, "Tu cuota vence el lunes 03/11");
  assert.ok(e.html.includes("Son $55.500 &lt;b&gt;hoy&lt;/b&gt;."));
  assert.ok(e.html.includes('href="https://app.extremedance.com.ar/pagos"'));
  assert.ok(e.text.startsWith("Hola, Vale:"));
});

test("un enlace raro va a la bandeja de avisos", () => {
  const e = noticeEmail({ firstName: null, title: "Hola", body: "", link: "https://otro.com" }, "https://app.x", "Academia");
  assert.ok(e.html.includes('href="https://app.x/avisos"'));
});
