"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useReyoPackRealtime(workspaceId: string | undefined, onChanged: () => void): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      setConnected(false);
      return;
    }
    let active = true;
    const topic = `reyo-pack:${workspaceId}`;
    const channel = supabase.channel(topic, { config: { private: true } });
    void supabase.realtime.setAuth().catch(() => undefined);
    channel
      .on("broadcast", { event: "STATE_CHANGED" }, () => {
        if (active) onChanged();
      })
      .subscribe((status) => {
        if (!active) return;
        setConnected(status === "SUBSCRIBED");
      });
    return () => {
      active = false;
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, onChanged]);

  return connected;
}
