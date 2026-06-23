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
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleNetworkStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ online?: unknown }>).detail;
      if (typeof detail?.online === "boolean") {
        setIsOnline(detail.online);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(NETWORK_STATUS_EVENT_NAME, handleNetworkStatus);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(NETWORK_STATUS_EVENT_NAME, handleNetworkStatus);
    };
  }, []);

  return isOnline;
}
