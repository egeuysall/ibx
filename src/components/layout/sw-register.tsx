"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const hostname = window.location.hostname;
    const isLocalDevHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1";
    const shouldRegisterServiceWorker =
      process.env.NODE_ENV === "production" && !isLocalDevHost;

    if (!shouldRegisterServiceWorker) {
      const LOCAL_SW_CLEANUP_RELOAD_KEY = "ibx:sw-cleanup-reloaded";

      void (async () => {
        let hadActiveServiceWorker = Boolean(navigator.serviceWorker.controller);

        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          if (registrations.length > 0) {
            hadActiveServiceWorker = true;
          }
          await Promise.all(
            registrations.map((registration) => registration.unregister()),
          );
        } catch {
          // Ignore SW cleanup failures.
        }

        if (typeof caches !== "undefined") {
          try {
            const keys = await caches.keys();
            if (keys.length > 0) {
              hadActiveServiceWorker = true;
            }
            await Promise.all(keys.map((key) => caches.delete(key)));
          } catch {
            // Ignore cache cleanup failures.
          }
        }

        if (hadActiveServiceWorker) {
          const hasReloaded = window.sessionStorage.getItem(
            LOCAL_SW_CLEANUP_RELOAD_KEY,
          );
          if (!hasReloaded) {
            window.sessionStorage.setItem(LOCAL_SW_CLEANUP_RELOAD_KEY, "1");
            window.location.reload();
            return;
          }
        }

        window.sessionStorage.removeItem(LOCAL_SW_CLEANUP_RELOAD_KEY);
      })();
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }, []);

  return null;
}
