// Service worker: shows phone alerts even when the site is closed.
// Put this file at public/sw.js (it must be served from the site root: /sw.js).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Mallik Service";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined, // same tag = replaces instead of stacking duplicates
      data: { url: data.url || "/" },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          try { await client.navigate(target); } catch { /* some browsers can't navigate: focusing is enough */ }
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});