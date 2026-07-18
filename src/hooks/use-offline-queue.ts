import { useState, useEffect, useCallback } from "react";
import { useToastStore } from "@/hooks/use-toast-store";

export interface QueuedAction {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}

const QUEUE_KEY = "sellerplus_offline_queue";

export function useOfflineQueue() {
  const [isOffline, setIsOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  // Initialize network status
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);

      const handleOnline = () => {
        setIsOffline(false);
        processQueue();
      };
      
      const handleOffline = () => setIsOffline(true);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      // Load initial queue count
      const existing = localStorage.getItem(QUEUE_KEY);
      if (existing) {
        setQueueCount(JSON.parse(existing).length);
      }

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  const enqueueAction = useCallback((type: string, payload: any) => {
    const newAction: QueuedAction = {
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
    };

    const existingStr = localStorage.getItem(QUEUE_KEY);
    const queue: QueuedAction[] = existingStr ? JSON.parse(existingStr) : [];
    
    queue.push(newAction);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    setQueueCount(queue.length);
    
    useToastStore.getState().warning("Offline Mode", "Action queued and will sync when connected.");
  }, []);

  const processQueue = async () => {
    const existingStr = localStorage.getItem(QUEUE_KEY);
    if (!existingStr) return;

    const queue: QueuedAction[] = JSON.parse(existingStr);
    if (queue.length === 0) return;

    useToastStore.getState().info("Syncing...", `Syncing ${queue.length} pending actions.`);

    const remainingQueue: QueuedAction[] = [];

    for (const action of queue) {
      try {
        if (action.type === "pack_order") {
          const res = await fetch(`/api/warehouse/${action.payload.orderId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: action.payload.status }),
          });
          if (!res.ok) throw new Error("Sync failed");
        }
        // Add more action types here as needed
      } catch (err) {
        console.error("Failed to sync action", action, err);
        remainingQueue.push(action);
      }
    }

    localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
    setQueueCount(remainingQueue.length);

    if (remainingQueue.length === 0) {
      useToastStore.getState().success("Synced", "All offline actions synced successfully.");
    } else {
      useToastStore.getState().error("Sync Incomplete", `${remainingQueue.length} actions failed to sync.`);
    }
  };

  return {
    isOffline,
    queueCount,
    enqueueAction,
    processQueue
  };
}
