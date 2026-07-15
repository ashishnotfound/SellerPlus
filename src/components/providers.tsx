"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      try {
        const { getSupabase } = await import("@/lib/supabase");
        const client = getSupabase();
        const { data } = await client.auth.getSession();
        const token = data?.session?.access_token;

        const urlStr = typeof input === "string"
          ? input
          : (input instanceof URL ? input.href : (input as Request).url);

        const isSameOrigin = !urlStr.startsWith("http://") && !urlStr.startsWith("https://")
          || urlStr.startsWith(window.location.origin);

        if (isSameOrigin && token) {
          init = init || {};
          let headers: Record<string, string> = {};
          if (init.headers) {
            if (init.headers instanceof Headers) {
              init.headers.forEach((value, key) => {
                headers[key] = value;
              });
            } else if (Array.isArray(init.headers)) {
              init.headers.forEach(([key, value]) => {
                headers[key] = value;
              });
            } else {
              headers = { ...init.headers } as Record<string, string>;
            }
          }
          if (!headers["Authorization"] && !headers["authorization"]) {
            headers["Authorization"] = `Bearer ${token}`;
          }
          init.headers = headers;
        }
      } catch (e) {
        console.warn("Fetch interceptor auth injection failed:", e);
      }
      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
