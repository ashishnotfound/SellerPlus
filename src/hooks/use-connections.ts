"use client";

import { create } from "zustand";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

interface ConnectionState {
  amazonConnected: boolean;
  flipkartConnected: boolean;
  meeshoConnected: boolean;
  shopifyConnected: boolean;
  amazonSellerId: string;
  amazonMarketplace: string;
  amazonAccountId: string | null;
  loading: boolean;
  error: string | null;
  activeScopeKey: string | null;
  loadConnections: (userId?: string) => Promise<void>;
}

/**
 * Browser-safe connection summary. Secret-bearing legacy connection rows are
 * intentionally never selected or cached in client state.
 */
export const useConnections = create<ConnectionState>((set) => ({
  amazonConnected: false,
  flipkartConnected: false,
  meeshoConnected: false,
  shopifyConnected: false,
  amazonSellerId: "",
  amazonMarketplace: "India",
  amazonAccountId: null,
  loading: false,
  error: null,
  activeScopeKey: null,

  loadConnections: async (userId) => {
    const workspaceId = useAuth.getState().user?.workspaceId;
    if (!workspaceId) return;
    set({ loading: true, error: null, activeScopeKey: `${userId ?? "user"}:${workspaceId}` });
    try {
      const response = await sellerplusApiFetch("/api/connections");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Marketplace connections are unavailable.");
      const accounts = Array.isArray(body.data) ? body.data : [];
      const amazon = accounts.find((account: Record<string, unknown>) => account.platform === "amazon");

      set({
        amazonConnected: Boolean(
          amazon?.status === "active"
          && Array.isArray(amazon.capabilities)
          && amazon.capabilities.length > 0
        ),
        amazonSellerId: typeof amazon?.seller_account_id === "string" ? amazon.seller_account_id : "",
        amazonMarketplace: typeof amazon?.region === "string" ? amazon.region : "India",
        amazonAccountId: typeof amazon?.id === "string" ? amazon.id : null,
        flipkartConnected: accounts.some((account: Record<string, unknown>) => account.platform === "flipkart" && account.status === "active"),
        meeshoConnected: accounts.some((account: Record<string, unknown>) => account.platform === "meesho" && account.status === "active"),
        shopifyConnected: accounts.some((account: Record<string, unknown>) => account.platform === "shopify" && account.status === "active"),
        loading: false,
      });
    } catch (error) {
      set({
        amazonConnected: false,
        flipkartConnected: false,
        meeshoConnected: false,
        shopifyConnected: false,
        amazonSellerId: "",
        amazonMarketplace: "India",
        amazonAccountId: null,
        loading: false,
        error: error instanceof Error ? error.message : "Marketplace connections are unavailable.",
      });
    }
  },
}));
