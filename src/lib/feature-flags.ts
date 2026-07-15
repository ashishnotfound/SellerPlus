/**
 * SellerPlus OS — Feature Flag Engine
 * 
 * Manages dynamic runtime switches for experimental components, AI gateways,
 * and rollouts. Evaluates recursive dependency chains, user-specific overrides,
 * active environment defaults, and deterministic user percentage rollouts.
 */

import { getAdminClient } from "@/lib/auth-middleware";

export interface FeatureFlag {
  key: string;
  description: string;
  is_enabled: boolean;
  env_defaults: Record<string, boolean>;
  dependencies: string[];
  rules: {
    rollout_percentage?: number; // 0 to 100
  };
}

/**
 * Deterministically maps a user ID UUID string to a number 0-99 for user partitioning.
 */
function hashUserIdToPercentage(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32-bit integer conversion
  }
  return Math.abs(hash) % 100;
}

// ─── In-Process TTL Cache ─────────────────────────────────────────────
// Reduces feature flag DB queries from 2+ per request to 0 on cache hit.
// 60-second TTL balances flag freshness vs. database pressure.
// Cache is process-local (lost on cold start) — intentionally simple.

interface FlagCacheEntry {
  value: boolean;
  expiresAt: number;
}

const FLAG_CACHE = new Map<string, FlagCacheEntry>();
const FLAG_CACHE_TTL_MS = 60_000; // 60 seconds

function getCachedFlag(key: string): boolean | undefined {
  const entry = FLAG_CACHE.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    FLAG_CACHE.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCachedFlag(key: string, value: boolean): void {
  FLAG_CACHE.set(key, { value, expiresAt: Date.now() + FLAG_CACHE_TTL_MS });
}

/**
 * Checks if a feature flag is enabled for the active user context.
 * Resolves recursive parent dependencies, environment defaults, and percentage rollouts.
 * Results are cached in-process for 60 seconds to reduce DB load.
 */
export async function isFeatureEnabled(key: string, userId?: string): Promise<boolean> {
  const cacheKey = `${key}:${userId ?? "global"}`;
  const cached = getCachedFlag(cacheKey);
  if (cached !== undefined) return cached;

  const adminClient = getAdminClient();
  const env = process.env.NODE_ENV || "development";

  // 1. Fetch feature flag from database
  const { data: flag, error } = await adminClient
    .from("feature_flags")
    .select("key, is_enabled, env_defaults, dependencies, rules")
    .eq("key", key)
    .maybeSingle();

  if (error || !flag) {
    // If the database query fails or the flag doesn't exist, log warning and return false
    console.warn(`[FeatureFlag] Flag "${key}" not found in database.`);
    return false;
  }

  const typedFlag = flag as FeatureFlag;

  // 2. Evaluate dependency chain recursively to avoid cyclic resolution lockouts
  if (typedFlag.dependencies && typedFlag.dependencies.length > 0) {
    for (const depKey of typedFlag.dependencies) {
      const isDepEnabled = await isFeatureEnabled(depKey, userId);
      if (!isDepEnabled) {
        setCachedFlag(cacheKey, false);
        return false;
      }
    }
  }

  // 3. Check for specific user override in feature_flag_overrides
  if (userId) {
    const { data: override } = await adminClient
      .from("feature_flag_overrides")
      .select("is_enabled")
      .eq("flag_key", key)
      .eq("user_id", userId)
      .maybeSingle();

    if (override) {
      setCachedFlag(cacheKey, override.is_enabled);
      return override.is_enabled;
    }
  }

  // 4. Check global is_enabled switch
  if (!typedFlag.is_enabled) {
    setCachedFlag(cacheKey, false);
    return false;
  }

  // 5. Evaluate rollout percentage rules (A/B testing)
  if (userId && typedFlag.rules?.rollout_percentage !== undefined) {
    const userPercent = hashUserIdToPercentage(userId);
    const targetPercent = typedFlag.rules.rollout_percentage;
    if (userPercent >= targetPercent) {
      setCachedFlag(cacheKey, false);
      return false; // User falls outside the rollout cohort
    }
  }

  // 6. Fall back to environment defaults
  if (typedFlag.env_defaults && typedFlag.env_defaults[env] !== undefined) {
    const envResult = typedFlag.env_defaults[env];
    setCachedFlag(cacheKey, envResult);
    return envResult;
  }

  setCachedFlag(cacheKey, true);
  return true; // Default fallback if no constraints reject
}
