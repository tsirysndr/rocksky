self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = event.notification.data?.path;
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return;
  const target = new URL(path, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(clients.openWindow(target.href));
});
