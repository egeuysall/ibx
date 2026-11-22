"use client";

import { useEffect, useState } from "react";

import { NETWORK_STATUS_EVENT_NAME } from "@/lib/apiClient";

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === "undefined") {
      return true;
    }
    return navigator.onLine;
  });

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let believedOnline = navigator.onLine;

    // navigator.onLine can be stuck false with a working connection, so confirm with a real request.
    const verifyConnectivity = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 4_000);

      try {
        await fetch("/api/session", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        if (!disposed) {
          believedOnline = true;
          setIsOnline(true);
        }
      } catch {
        if (!disposed) {
          believedOnline = false;
          setIsOnline(false);
        }
      } finally {
        window.clearTimeout(timeoutId);
        inFlight = false;
      }
    };

    const handleOnline = () => {
      believedOnline = true;
      setIsOnline(true);
    };
    const handleOffline = () => {
      void verifyConnectivity();
    };
    const handleNetworkStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ online?: unknown }>).detail;
      if (detail?.online === true) {
        believedOnline = true;
        setIsOnline(true);
      } else if (detail?.online === false) {
        void verifyConnectivity();
      }
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        void verifyConnectivity();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(NETWORK_STATUS_EVENT_NAME, handleNetworkStatus);
    document.addEventListener("visibilitychange", handleVisible);

    if (!navigator.onLine) {
      void verifyConnectivity();
    }

    // The "online" event never fires if the browser flag is wrong, so keep probing while offline.
    const intervalId = window.setInterval(() => {
      if (!believedOnline && document.visibilityState === "visible") {
        void verifyConnectivity();
      }
    }, 15_000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(NETWORK_STATUS_EVENT_NAME, handleNetworkStatus);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, []);

  return isOnline;
}
