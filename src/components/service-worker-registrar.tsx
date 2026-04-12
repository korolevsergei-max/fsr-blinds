"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });

    if ("caches" in window) {
      void caches.keys().then((keys) => {
        keys
          .filter((key) => key.startsWith("fsr-"))
          .forEach((key) => {
            void caches.delete(key);
          });
      });
    }
  }, []);

  return null;
}
