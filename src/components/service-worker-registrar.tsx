"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          // Always revalidate sw.js itself against the network so a version bump
          // or the kill-switch is picked up on the next load (update-on-reload).
          updateViaCache: "none",
        });
        if (cancelled) return;
        // Trigger an update check on every mount so a newly deployed shell
        // (or a KILL_SWITCH build) activates without waiting for the browser's
        // periodic check.
        void registration.update().catch(() => {});
      } catch {
        // Registration failure is non-fatal — the app works without the shell
        // cache, just without the warm-load speedup.
      }
    };

    void register();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
