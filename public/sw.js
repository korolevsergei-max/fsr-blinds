/// <reference lib="webworker" />

// App-shell service worker.
//
// Goal: stop weak connections from re-downloading the full JS bundle on every
// visit by caching the immutable, content-hashed build output. This app is
// realtime, so we cache ONLY content-hashed static assets and never anything
// that could carry authenticated or mutable data (route documents, RSC
// payloads, Server Actions, Supabase/API/auth requests).
//
// Kill-switch / versioning:
// - Bump SW_VERSION to ship a new shell. The activate handler then evicts every
//   older fsr-* cache, so a bad cache can't linger.
// - Set KILL_SWITCH = true and deploy to remotely disable the SW entirely: it
//   clears all fsr-* caches and unregisters itself, reverting to the old
//   no-shell behavior for every client that loads the new build.
const SW_VERSION = "v1";
const KILL_SWITCH = false;

const CACHE_PREFIX = "fsr-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${SW_VERSION}`;

// The only thing we ever cache: Next.js build output under /_next/static/**.
// These URLs are content-hashed, so they are immutable and safe to cache
// forever — a new deploy ships new filenames and simply misses the cache.
function isImmutableStatic(url) {
  return url.pathname.startsWith("/_next/static/");
}

async function clearAllShellCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .map((key) => caches.delete(key))
  );
}

self.addEventListener("install", () => {
  if (KILL_SWITCH) return;
  // Take over as soon as possible so the new shell replaces any previous SW
  // (including the old self-destruct one) without waiting for all tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (KILL_SWITCH) {
        await clearAllShellCaches();
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
        return;
      }

      // Drop every old fsr-* cache (the previous self-destruct SW's caches and
      // any earlier shell version), keeping only the current shell.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (KILL_SWITCH) return;

  const request = event.request;

  // Never touch non-GET requests — Server Actions and other mutations are POST.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cross-origin (Supabase, auth, APIs, images) → straight to the network.
  if (url.origin !== self.location.origin) return;

  // Same-origin route documents, RSC payloads, and everything that isn't a
  // hashed static asset → network only. Stale data here would be a correctness
  // bug in a realtime app.
  if (!isImmutableStatic(url)) return;

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Only persist successful same-origin responses.
  if (response && response.ok && response.type === "basic") {
    cache.put(request, response.clone());
  }
  return response;
}
