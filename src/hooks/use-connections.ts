"use client";

import { create } from "zustand";

interface ConnectionState {
  amazonConnected: boolean;
  flipkartConnected: boolean;
  meeshoConnected: boolean;
  shopifyConnected: boolean;
  
  amazonSellerId: string;
  amazonMarketplace: string;
  
  connectAmazon: (sellerId: string, marketplace: string) => void;
  disconnectAmazon: () => void;
  
  connectFlipkart: () => void;
  disconnectFlipkart: () => void;
  
  connectMeesho: () => void;
  disconnectMeesho: () => void;
  
  connectShopify: () => void;
  disconnectShopify: () => void;
  
  loadConnections: () => void;
}

const isBrowser = typeof window !== "undefined";

export const useConnections = create<ConnectionState>((set) => ({
  amazonConnected: false,
  flipkartConnected: false,
  meeshoConnected: false,
  shopifyConnected: false,
  
  amazonSellerId: "",
  amazonMarketplace: "India (amazon.in)",
  
  connectAmazon: (sellerId, marketplace) => {
    const newState = {
      amazonConnected: true,
      amazonSellerId: sellerId,
      amazonMarketplace: marketplace,
    };
    if (isBrowser) {
      const stored = localStorage.getItem("sp_connections") || "{}";
      try {
        const parsed = JSON.parse(stored);
        localStorage.setItem("sp_connections", JSON.stringify({ ...parsed, ...newState }));
      } catch (_) {
        localStorage.setItem("sp_connections", JSON.stringify(newState));
      }
    }
    set(newState);
  },
  
  disconnectAmazon: () => {
    const newState = {
      amazonConnected: false,
      amazonSellerId: "",
    };
    if (isBrowser) {
      const stored = localStorage.getItem("sp_connections") || "{}";
      try {
        const parsed = JSON.parse(stored);
        localStorage.setItem("sp_connections", JSON.stringify({ ...parsed, ...newState }));
      } catch (_) {}
    }
    set(newState);
  },
  
  connectFlipkart: () => {
    if (isBrowser) {
      const stored = localStorage.getItem("sp_connections") || "{}";
      try {
        const parsed = JSON.parse(stored);
        localStorage.setItem("sp_connections", JSON.stringify({ ...parsed, flipkartConnected: true }));
      } catch (_) {}
    }
    set({ flipkartConnected: true });
  },
  
  disconnectFlipkart: () => {
    if (isBrowser) {
      const stored = localStorage.getItem("sp_connections") || "{}";
      try {
        const parsed = JSON.parse(stored);
        localStorage.setItem("sp_connections", JSON.stringify({ ...parsed, flipkartConnected: false }));
      } catch (_) {}
    }
    set({ flipkartConnected: false });
  },
  
  connectMeesho: () => {
    if (isBrowser) {
      const stored = localStorage.getItem("sp_connections") || "{}";
      try {
        const parsed = JSON.parse(stored);
        localStorage.setItem("sp_connections", JSON.stringify({ ...parsed, meeshoConnected: true }));
      } catch (_) {}
    }
    set({ meeshoConnected: true });
  },
  
  disconnectMeesho: () => {
    if (isBrowser) {
      const stored = localStorage.getItem("sp_connections") || "{}";
      try {
        const parsed = JSON.parse(stored);
        localStorage.setItem("sp_connections", JSON.stringify({ ...parsed, meeshoConnected: false }));
      } catch (_) {}
    }
    set({ meeshoConnected: false });
  },
  
  connectShopify: () => {
    if (isBrowser) {
      const stored = localStorage.getItem("sp_connections") || "{}";
      try {
        const parsed = JSON.parse(stored);
        localStorage.setItem("sp_connections", JSON.stringify({ ...parsed, shopifyConnected: true }));
      } catch (_) {}
    }
    set({ shopifyConnected: true });
  },
  
  disconnectShopify: () => {
    if (isBrowser) {
      const stored = localStorage.getItem("sp_connections") || "{}";
      try {
        const parsed = JSON.parse(stored);
        localStorage.setItem("sp_connections", JSON.stringify({ ...parsed, shopifyConnected: false }));
      } catch (_) {}
    }
    set({ shopifyConnected: false });
  },
  
  loadConnections: () => {
    if (isBrowser) {
      const stored = localStorage.getItem("sp_connections");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          set({
            amazonConnected: !!parsed.amazonConnected,
            flipkartConnected: !!parsed.flipkartConnected,
            meeshoConnected: !!parsed.meeshoConnected,
            shopifyConnected: !!parsed.shopifyConnected,
            amazonSellerId: parsed.amazonSellerId || "",
            amazonMarketplace: parsed.amazonMarketplace || "India (amazon.in)",
          });
        } catch (e) {
          console.error("Failed to parse stored connections", e);
        }
      }
    }
  },
}));
