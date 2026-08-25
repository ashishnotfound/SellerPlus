"use client";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

/**
 * Authenticated browser request bound to the user's currently selected tenant.
 * Server routes still verify membership; the header only selects which verified
 * membership should be used when a user belongs to more than one workspace.
 */
export async function sellerplusApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const workspaceId = useAuth.getState().user?.workspaceId;
  const { data: { session } } = await supabase.auth.getSession();
  if (!workspaceId || !session?.access_token) {
    throw new Error("Your SellerPlus session expired. Sign in again.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  headers.set("x-sellerplus-workspace-id", workspaceId);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  return fetch(path, { ...init, headers, cache: init.cache ?? "no-store" });
}
