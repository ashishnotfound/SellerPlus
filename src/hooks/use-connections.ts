"use client";

/**
 * SellerPlus OS — Connection State Store
 *
 * Manages marketplace connection state (Amazon, Flipkart, Meesho, Shopify).
 *
 * Amazon credentials are persisted in Supabase (amazon_connections table),
 * NOT in localStorage. Only UI-level flags (e.g. connected/disconnected) are
 * derived client-side from the Supabase record. This ensures:
 *   - Users never lose their connection on browser refresh or device change.
 *   - Credentials are never exposed in browser storage (XSS protection).
 *   - Multi-device access works correctly.
 *
 * Non-Amazon integrations (Flipkart, Meesho, Shopify) remain as UI stubs
 * until real API credentials are supported.
 */

import { create } from "zustand";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AmazonConnectionRecord {
  id: string;
  seller_id: string;
  marketplace: string;
  marketplace_id: string | null;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  is_sandbox: boolean;
  last_listings_sync: string | null;
  last_orders_sync: string | null;
  last_inventory_sync: string | null;
  last_ads_sync: string | null;
  last_refunds_sync: string | null;
}

interface ConnectionState {
  // Connection flags (derived from DB record)
  amazonConnected: boolean;
  flipkartConnected: boolean;
  meeshoConnected: boolean;
  shopifyConnected: boolean;

  // Amazon metadata (safe to expose to client)
  amazonSellerId: string;
  amazonMarketplace: string;
  amazonIsSandbox: boolean;

  // Full connection record (contains credentials — only used by sync flows)
  amazonConnection: AmazonConnectionRecord | null;

  // Actions
  /** Load connection state from Supabase for the authenticated user */
  loadConnections: (userId?: string) => Promise<void>;

  /** Save a new Amazon connection to Supabase and update local state */
  connectAmazon: (
    userId: string,
    sellerId: string,
    marketplace: string,
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    isSandbox?: boolean
  ) => Promise<void>;

  /** Remove the Amazon connection from Supabase */
  disconnectAmazon: (userId: string) => Promise<void>;

  /** Update sync timestamps after a successful sync */
  updateSyncTimestamp: (
    userId: string,
    field: "last_listings_sync" | "last_orders_sync" | "last_inventory_sync" | "last_ads_sync" | "last_refunds_sync"
  ) => Promise<void>;

  // Stub actions for future integrations
  connectFlipkart: () => void;
  disconnectFlipkart: () => void;
  connectMeesho: () => void;
  disconnectMeesho: () => void;
  connectShopify: () => void;
  disconnectShopify: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useConnections = create<ConnectionState>((set, get) => ({
  amazonConnected: false,
  flipkartConnected: false,
  meeshoConnected: false,
  shopifyConnected: false,

  amazonSellerId: "",
  amazonMarketplace: "India (amazon.in)",
  amazonIsSandbox: false,
  amazonConnection: null,

  // ── Load from Supabase ────────────────────────────────────────────────────
  loadConnections: async (userId?: string) => {
    if (!userId) {
      // No userId provided — try to get it from the current supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      userId = session.user.id;
    }

    try {
      const { data, error } = await supabase
        .from("amazon_connections")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        console.warn("[useConnections] Failed to load Amazon connection:", error.message);
        return;
      }

      if (data) {
        set({
          amazonConnected: true,
          amazonSellerId: data.seller_id || "",
          amazonMarketplace: data.marketplace || "India (amazon.in)",
          amazonIsSandbox: data.is_sandbox || false,
          amazonConnection: data as AmazonConnectionRecord,
        });
      } else {
        set({
          amazonConnected: false,
          amazonSellerId: "",
          amazonMarketplace: "India (amazon.in)",
          amazonIsSandbox: false,
          amazonConnection: null,
        });
      }
    } catch (e) {
      console.error("[useConnections] loadConnections exception:", e);
    }
  },

  // ── Connect Amazon ────────────────────────────────────────────────────────
  connectAmazon: async (userId, sellerId, marketplace, clientId, clientSecret, refreshToken, isSandbox = false) => {
    try {
      const marketplaceIdMap: Record<string, string> = {
        "India (amazon.in)": "A21TJRUUN4KGV",
        "United States (amazon.com)": "ATVPDKIKX0DER",
        "United Kingdom (amazon.co.uk)": "A1F83G8C2ARO7P",
        "Germany (amazon.de)": "A1PA6795UKMFR9",
        "Japan (amazon.co.jp)": "A1VC38T7YXB528",
        "Canada (amazon.ca)": "A2EUQ1WTGCTBG2",
        "Australia (amazon.com.au)": "A39IBJ37TRP1C6",
        "UAE (amazon.ae)": "A2VIGQ35RCS4UG",
      };

      const marketplaceId = marketplaceIdMap[marketplace] || "A21TJRUUN4KGV";

      const payload = {
        user_id: userId,
        seller_id: sellerId,
        marketplace,
        marketplace_id: marketplaceId,
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        is_sandbox: isSandbox,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("amazon_connections")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();

      if (error) {
        console.error("[useConnections] Failed to save Amazon connection:", error.message);
        throw new Error(`Failed to save connection: ${error.message}`);
      }

      set({
        amazonConnected: true,
        amazonSellerId: sellerId,
        amazonMarketplace: marketplace,
        amazonIsSandbox: isSandbox,
        amazonConnection: data as AmazonConnectionRecord,
      });
    } catch (e) {
      console.error("[useConnections] connectAmazon exception:", e);
      throw e;
    }
  },

  // ── Disconnect Amazon ─────────────────────────────────────────────────────
  disconnectAmazon: async (userId: string) => {
    try {
      const { error } = await supabase
        .from("amazon_connections")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (error) {
        console.error("[useConnections] Failed to disconnect Amazon:", error.message);
      }

      set({
        amazonConnected: false,
        amazonSellerId: "",
        amazonMarketplace: "India (amazon.in)",
        amazonIsSandbox: false,
        amazonConnection: null,
      });
    } catch (e) {
      console.error("[useConnections] disconnectAmazon exception:", e);
    }
  },

  // ── Update Sync Timestamp ─────────────────────────────────────────────────
  updateSyncTimestamp: async (userId, field) => {
    try {
      await supabase
        .from("amazon_connections")
        .update({ [field]: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_active", true);

      // Update local state too
      const current = get().amazonConnection;
      if (current) {
        set({
          amazonConnection: {
            ...current,
            [field]: new Date().toISOString(),
          },
        });
      }
    } catch (e) {
      console.warn("[useConnections] updateSyncTimestamp failed:", e);
    }
  },

  // ── Stub integrations (future) ────────────────────────────────────────────
  connectFlipkart: () => set({ flipkartConnected: true }),
  disconnectFlipkart: () => set({ flipkartConnected: false }),
  connectMeesho: () => set({ meeshoConnected: true }),
  disconnectMeesho: () => set({ meeshoConnected: false }),
  connectShopify: () => set({ shopifyConnected: true }),
  disconnectShopify: () => set({ shopifyConnected: false }),
}));
