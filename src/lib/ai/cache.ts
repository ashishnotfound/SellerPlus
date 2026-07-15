/**
 * SellerPlus OS — AI Response Caching Manager
 * 
 * Provides database-backed compound caching with custom TTLs,
 * negative caching for transient provider errors, and manual bypasses.
 */

import { createHash } from "crypto";
import { getAdminClient } from "@/lib/auth-middleware";
import { config } from "@/lib/config";
import { GenerationOptions, GenerationResult } from "./types";

const CACHE_VERSION = 1;

/**
 * Computes a compound SHA-256 hash of the complete generation parameters.
 */
export function generateCacheKey(
  provider: string,
  model: string,
  temperature: number,
  systemPrompt: string,
  prompt: string
): string {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify({
      version: CACHE_VERSION,
      provider,
      model,
      temperature,
      systemPrompt,
      prompt
    })
  );
  return hash.digest("hex");
}

export interface CacheResult extends GenerationResult {
  isNegative?: boolean;
}

export class AiCacheManager {
  /**
   * Retrieves a valid cache entry. Returns null on miss or expiration.
   */
  async get(key: string): Promise<CacheResult | null> {
    const adminClient = getAdminClient();

    const { data, error } = await adminClient
      .from("ai_response_cache")
      .select("response_text, tokens_used, estimated_cost, is_negative, expires_at")
      .eq("cache_key", key)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const expiresAt = new Date(data.expires_at).getTime();
    if (Date.now() > expiresAt) {
      // Clean up expired cache entry in background
      adminClient.from("ai_response_cache").delete().eq("cache_key", key).then();
      return null;
    }

    return {
      text: data.response_text,
      tokensUsed: data.tokens_used,
      estimatedCost: Number(data.estimated_cost),
      isNegative: data.is_negative
    };
  }

  /**
   * Saves a successful response or transient failure (negative cache) to the database cache.
   */
  async set(
    key: string,
    result: GenerationResult,
    options?: GenerationOptions,
    isNegative = false
  ): Promise<void> {
    const adminClient = getAdminClient();
    
    // Choose TTL: Negative caching gets a short duration, otherwise use option or global config
    const ttlSeconds = isNegative 
      ? config.ai.negativeCacheTtl 
      : (options?.cacheTtl !== undefined ? options.cacheTtl : config.ai.cacheTtl);

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    await adminClient
      .from("ai_response_cache")
      .upsert({
        cache_key: key,
        response_text: result.text,
        tokens_used: result.tokensUsed || 0,
        estimated_cost: result.estimatedCost || 0.0,
        is_negative: isNegative,
        expires_at: expiresAt,
        created_at: new Date().toISOString()
      });
  }

  /**
   * Manually invalidates a cache key.
   */
  async invalidate(key: string): Promise<void> {
    const adminClient = getAdminClient();
    await adminClient.from("ai_response_cache").delete().eq("cache_key", key);
  }
}

export const aiCacheManager = new AiCacheManager();
