/* Service worker de Extreme Dance: recibe las notificaciones al celular. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Extreme Dance", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Extreme Dance";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/avisos" },
    }),
  );
});

// Al tocarla: abre (o trae al frente) la app en la pantalla del aviso.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/avisos";
  const url = new URL(/^\/[a-z0-9/_-]*$/.test(path) ? path : "/avisos", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.navigate(url).then((c) => (c || w).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
