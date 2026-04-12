/// <reference lib="webworker" />

const CACHE_PREFIX = "fsr-";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))
      );

      await self.registration.unregister();

      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      windowClients.forEach((client) => {
        if ("navigate" in client) {
          client.navigate(client.url);
        }
      });
    })()
  );
});
