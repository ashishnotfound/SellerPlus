"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const { url, publishableKey } = getPublicSupabaseConfig();
  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}

