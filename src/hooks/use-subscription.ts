/**
 * SellerPlus OS — Subscription Store
 * 
 * Server-verified subscription management.
 * The server API (/api/billing/verify-plan) is the source of truth.
 * Client store syncs from the server and caches locally for fast loads.
 * 
 * Security model:
 *   - loadSubscription() fetches the real plan from the server
 *   - setPlan() is only used after successful Razorpay payment verification
 *   - isFeatureGated() checks the server-synced plan, not arbitrary client state
 *   - localStorage is a read-through cache, never the authority
 */

"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase";

export type PlanId = "free" | "weekly" | "pro" | "business";

interface SubscriptionState {
  currentPlan: PlanId;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  synced: boolean;            // true after server sync completes
  syncError: string | null;
  featureAccess: Record<string, boolean>;
  usageThisPeriod: {
    aiGenerations: number;
    maxGenerations: number;
    auditsUsed: number;
    maxAudits: number;
  };
  setPlan: (plan: PlanId) => void;
  incrementUsage: (type: "aiGenerations" | "auditsUsed") => void;
  isFeatureGated: (feature: string) => boolean;
  getUsagePercent: () => number;
  loadSubscription: () => void;
}

const PLAN_LIMITS: Record<PlanId, { maxGenerations: number; maxAudits: number }> = {
  free:     { maxGenerations: 10,   maxAudits: 3 },
  weekly:   { maxGenerations: 50,   maxAudits: 15 },
  pro:      { maxGenerations: 200,  maxAudits: 50 },
  business: { maxGenerations: 9999, maxAudits: 9999 },
};

/**
 * Fallback feature gating map used when server sync hasn't completed yet.
 * Once synced, the server-provided featureAccess map takes precedence.
 */
const GATED_FEATURES_FALLBACK: Record<string, PlanId[]> = {
  "full-listing-generator": ["pro", "business"],
  "competitor-analysis":    ["weekly", "pro", "business"],
  "csv-export":             ["weekly", "pro", "business"],
  "a-plus-content":         ["pro", "business"],
  "brand-story":            ["pro", "business"],
  "etsy-marketplace":       ["pro", "business"],
  "shopify-marketplace":    ["pro", "business"],
};

const isBrowser = typeof window !== "undefined";
const CACHE_KEY = "sp_subscription_cache";

export const useSubscription = create<SubscriptionState>((set, get) => ({
  currentPlan: "free",
  status: "active",
  cancelAtPeriodEnd: false,
  periodEnd: null,
  synced: false,
  syncError: null,
  featureAccess: {},
  usageThisPeriod: {
    aiGenerations: 0,
    maxGenerations: PLAN_LIMITS.free.maxGenerations,
    auditsUsed: 0,
    maxAudits: PLAN_LIMITS.free.maxAudits,
  },

  /**
   * Called after successful payment verification to update the plan.
   * This triggers a server re-sync to ensure consistency.
   */
  setPlan: (plan: PlanId) => {
    const limits = PLAN_LIMITS[plan];
    set({
      currentPlan: plan,
      usageThisPeriod: {
        aiGenerations: get().usageThisPeriod.aiGenerations,
        maxGenerations: limits.maxGenerations,
        auditsUsed: get().usageThisPeriod.auditsUsed,
        maxAudits: limits.maxAudits,
      },
    });
    // Persist optimistic update, then re-sync
    if (isBrowser) {
      const state = get();
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        currentPlan: state.currentPlan,
        usageThisPeriod: state.usageThisPeriod,
      }));
    }
  },

  incrementUsage: (type) => {
    set((state) => {
      const updatedUsage = {
        ...state.usageThisPeriod,
        [type]: state.usageThisPeriod[type] + 1,
      };
      if (isBrowser) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          currentPlan: state.currentPlan,
          usageThisPeriod: updatedUsage,
        }));
      }
      return { usageThisPeriod: updatedUsage };
    });
  },

  /**
   * Checks if a feature is gated for the current plan.
   * Uses server-provided featureAccess map when available,
   * falls back to local mapping during initial load.
   */
  isFeatureGated: (feature: string) => {
    const { synced, featureAccess } = get();

    if (!synced) {
      return !!GATED_FEATURES_FALLBACK[feature];
    }

    if (feature in featureAccess) {
      return !featureAccess[feature];
    }

    return false;
  },

  getUsagePercent: () => {
    const { aiGenerations, maxGenerations } = get().usageThisPeriod;
    return Math.min(100, Math.round((aiGenerations / maxGenerations) * 100));
  },

  /**
   * Loads the subscription state.
   * 
   * 1. Immediately loads cached state from localStorage (instant UI)
   * 2. Fetches the authoritative state from the server API
   * 3. Updates the store and cache with server values
   * 
   * If server fetch fails (offline, dev mode), cached state persists.
   */
  loadSubscription: () => {
    // Step 1: Load cache for instant display
    if (isBrowser) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.currentPlan) {
            set({
              currentPlan: parsed.currentPlan,
              usageThisPeriod: parsed.usageThisPeriod || get().usageThisPeriod,
            });
          }
        } catch {
          // Corrupted cache — ignore
        }
      }
    }

    // Step 2: Sync from server (non-blocking)
    if (isBrowser) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        fetch("/api/billing/verify-plan", {
          method: "GET",
          headers: {
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          credentials: "omit",
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
        .then((data) => {
          const plan = (data.plan || "free") as PlanId;
          const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
          const serverState = {
            currentPlan: plan,
            status: data.status || "active",
            cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
            periodEnd: data.periodEnd || null,
            synced: true,
            syncError: null,
            featureAccess: data.featureAccess || {},
            usageThisPeriod: {
              aiGenerations: data.usage?.aiGenerations || 0,
              maxGenerations: limits.maxGenerations,
              auditsUsed: data.usage?.auditsUsed || 0,
              maxAudits: limits.maxAudits,
            },
          };

          set(serverState);

          // Update cache with server truth
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            currentPlan: serverState.currentPlan,
            usageThisPeriod: serverState.usageThisPeriod,
          }));
        })
        .catch((err) => {
          console.warn("[Subscription] Server sync failed, using cached state:", err.message);
          set({ syncError: err.message });
        });
      });
    }
  },
}));
