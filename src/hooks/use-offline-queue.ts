"use client";

import { useCallback, useEffect, useState } from "react";
import { useToastStore } from "@/hooks/use-toast-store";

/**
 * Consequential warehouse mutations intentionally fail closed while offline.
 * Replaying unsigned actions from localStorage could update the wrong tenant,
 * duplicate work, or apply a stale status transition. A future offline mode
 * must use the paired desktop worker's signed, tenant-scoped durable queue.
 */
export function useOfflineQueue() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const enqueueAction = useCallback((_type: string, _payload: unknown) => {
    useToastStore.getState().warning(
      "Connection required",
      "Warehouse status changes are not stored in the browser. Reconnect and try again.",
    );
  }, []);

  return {
    isOffline,
    queueCount: 0,
    enqueueAction,
    processQueue: async () => undefined,
  };
}
