// Seat alerts with the site closed (#16): the alert server (docs/PUSH.md) pushes when a section someone turned alerts
// on for opens, and this shows it. A click opens the section's page. Nothing is cached: the site works the same
// without this file. Registered by web/lib/push.ts only when someone presses "Alert me".

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** A page on this site: a relative path resolves against the site's root, and other sites aren't allowed. */
function sitePage(url) {
  const root = self.registration.scope;
  try {
    const u = new URL(url || "opened/?watch=1", root);
    return u.origin === self.location.origin && u.href.startsWith(root) ? u.href : new URL("opened/?watch=1", root).href;
  } catch {
    return new URL("opened/?watch=1", root).href;
  }
}

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(typeof msg.title === "string" && msg.title ? msg.title : "A section you watch just opened", {
      body: typeof msg.body === "string" && msg.body ? msg.body : "Open Just opened to see it, then register in Self-Service.",
      tag: typeof msg.tag === "string" && msg.tag ? msg.tag : "illini-seat-alert",
      data: { url: sitePage(msg.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sitePage(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((c) => c.url === url);
      return tab ? tab.focus() : self.clients.openWindow(url);
    }),
  );
});
