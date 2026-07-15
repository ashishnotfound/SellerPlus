/**
 * SellerPlus OS — AI Service Utilities & Centralized Gateway
 * 
 * Shared utilities for all AI service modules.
 * Implements the centralized routeLLMRequest gateway supporting
 * compound caching, 3-state circuit breakers, backoff retries,
 * request coalescing (single-flight), redacted structured logging,
 * telemetry metrics database sinks, and operational alerts.
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { getAdminClient } from "@/lib/auth-middleware";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { config } from "@/lib/config";
import { 
  LLMSetting, 
  GenerationOptions, 
  GenerationResult, 
  ProviderCapability 
} from "./types";
import { 
  getAdapterForSetting, 
  PROVIDER_CAPABILITIES 
} from "./adapters";
import { generateCacheKey, aiCacheManager } from "./cache";
import { resilienceStore } from "./resilience-store";
import { singleFlight } from "./single-flight";
import { log } from "@/lib/logger";
import { alertManager } from "@/lib/alert-manager";

// ─── Gemini Client (Legacy Env Key) ───────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * Returns a Gemini GenerativeModel instance.
 * @throws Error if GEMINI_API_KEY is not configured
 */
export function getModel(modelName: string = "gemini-2.0-flash-lite"): GenerativeModel {
  if (!genAI) {
    throw new Error("Gemini API key is not configured.");
  }
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Check if the Gemini API is available.
 */
export function isAiAvailable(): boolean {
  return genAI !== null;
}

// ─── HTML & Text Cleaning ────────────────────────────────────────────

/**
 * Strips HTML tags, script/style blocks, and normalizes whitespace.
 * Truncates to 15,000 chars to avoid token bloat in prompts.
 */
export function cleanHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 15000);
}

/**
 * Cleans a Gemini response string that may have markdown code fences.
 * Returns raw JSON-parseable text.
 */
export function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * Safely parse a Gemini JSON response with fallback.
 */
export function parseAiJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(cleanJsonResponse(text)) as T;
  } catch {
    console.error("[AI Utils] JSON parse failed. Raw text:", text.substring(0, 200));
    return fallback;
  }
}

// ─── Web Scraping ────────────────────────────────────────────────────

export interface ScrapeResult {
  title: string;
  price: string;
  body: string;
  blocked: boolean;
}

/**
 * Basic web scraper to pull title, pricing, and body text from a URL.
 * Detects Amazon's anti-bot measures and returns blocked=true if detected.
 */
export async function scrapeUrlText(url: string): Promise<ScrapeResult> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return { title: "", price: "", body: "", blocked: true };
    }

    const html = await res.text();

    if (html.includes("captcha") || html.includes("unusual traffic") || html.includes("Robot Check")) {
      return { title: "", price: "", body: "", blocked: true };
    }

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace("- Amazon.in", "").replace("- Amazon.com", "").trim()
      : "";

    const priceMatch =
      html.match(/class="[^"]*a-price-whole[^"]*"[^>]*>([^<]+)</i) ||
      html.match(/id="priceblock_ourprice"[^>]*>([^<]+)/i);
    const price = priceMatch ? priceMatch[1].trim() : "N/A";

    const bodyCleaned = cleanHtml(html);

    return { title, price, body: bodyCleaned, blocked: false };
  } catch (error) {
    console.error("[AI Utils] Scraping error:", error);
    return { title: "", price: "", body: "", blocked: true };
  }
}

// ─── Prompt Injection Guard ──────────────────────────────────────────

/**
 * Known prompt injection patterns to reject before forwarding to any LLM.
 * This list is deliberately conservative — false positives are acceptable;
 * a blocked legitimate request is far safer than a successful injection.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /ignore\s+all\s+instructions/i,
  /<\/?(system|assistant|user|human|ai)\s*>/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /SYSTEM\s+OVERRIDE/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /act\s+as\s+(if\s+you\s+are|an?\s+unrestricted)/i,
  /you\s+are\s+now\s+(an?\s+)?(unrestricted|jailbroken)/i,
];

/**
 * Throws if the prompt contains known prompt injection patterns.
 * Applied before every LLM call in routeLLMRequest.
 */
export function sanitizePrompt(prompt: string, correlationId?: string): void {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      log.warn(
        `[AIGateway] Prompt injection attempt detected and blocked.`,
        correlationId,
        { pattern: pattern.source }
      );
      throw new Error("Prompt rejected: contains prohibited injection patterns.");
    }
  }
}

// ─── AI Gateway Telemetry Logger ──────────────────────────────────────

/**
 * Persists latency, cache statuses, costs, and token counts to the analytics database.
 */
export async function recordAiTelemetry(
  providerModel: string,
  isCacheHit: boolean,
  latencyMs: number,
  tokensUsed: number,
  isNegative = false,
  retryCount = 0,
  repairAttempts = 0
): Promise<void> {
  try {
    const adminClient = getAdminClient();
    
    // Estimate rates: OpenRouter/Anthropic ~$0.015 per 1k tokens, Gemini/Ollama ~$0.002
    let unitCost = 0.002;
    if (providerModel.includes("openai") || providerModel.includes("anthropic") || providerModel.includes("gpt")) {
      unitCost = 0.015;
    }
    const estimatedCost = (tokensUsed / 1000) * unitCost;

    const cost = isCacheHit || isNegative ? 0.0 : estimatedCost;
    const savings = isCacheHit ? estimatedCost : 0.0;

    await adminClient
      .from("ai_telemetry_metrics")
      .insert({
        provider_model: providerModel,
        request_count: 1,
        cache_hits: isCacheHit ? 1 : 0,
        cache_misses: isCacheHit ? 0 : 1,
        total_latency_ms: latencyMs,
        tokens_used: tokensUsed,
        estimated_cost: cost,
        estimated_savings: savings,
        retry_count: retryCount,
        repair_attempts: repairAttempts,
        created_at: new Date().toISOString()
      });
  } catch (err) {
    log.warn("Failed to record AI telemetry metrics to database:", undefined, err);
  }
}

// ─── Centralized AI Gateway ──────────────────────────────────────────

/**
 * Normalize and route text generation requests across configured models.
 * Evaluates active capabilities, provider health checks, priority weight,
 * cache checks, and cascades on failover events with backoff retries.
 */
export async function routeLLMRequest(
  prompt: string,
  userId?: string,
  options?: GenerationOptions
): Promise<GenerationResult> {
  // Generate Request Correlation ID
  const correlationId = options?.correlationId || (
    typeof crypto !== "undefined" && crypto.randomUUID 
      ? crypto.randomUUID() 
      : "corr-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now()
  );

  // 0. Sanitize prompt — reject injection attempts before any provider call
  sanitizePrompt(prompt, correlationId);

  // 1. Verify feature flag status
  const gatewayEnabled = await isFeatureEnabled("ai_gateway", userId);
  if (!gatewayEnabled) {
    log.info("[AIGateway] Centralized gateway feature disabled. Falling back to default Gemini.", correlationId);
    return callFallbackGemini(prompt, options);
  }

  const adminClient = getAdminClient();
  let settings: LLMSetting[] = [];

  // 2. Fetch custom LLM settings from database
  if (userId) {
    try {
      const { data } = await adminClient
        .from("llm_settings")
        .select("provider, api_key, model_name, endpoint_url, priority, is_enabled")
        .eq("user_id", userId)
        .eq("is_enabled", true);

      settings = (data || []) as LLMSetting[];
    } catch (err) {
      log.warn("[AIGateway] Database settings query failed:", correlationId, err);
    }
  }

  // 3. Filter provider models by capability registry
  const requiredCaps = options?.capabilities || [];
  let eligibleProviders = settings.filter(s => {
    const caps = PROVIDER_CAPABILITIES[s.provider] || [];
    return requiredCaps.every(req => caps.includes(req));
  });

  // 4. Resolve routing candidate list
  if (eligibleProviders.length === 0) {
    const defaultKey = process.env.GEMINI_API_KEY;
    if (defaultKey) {
      eligibleProviders = [{
        provider: "gemini",
        api_key: defaultKey,
        model_name: "gemini-2.0-flash-lite",
        priority: 1,
        is_enabled: true
      }];
    }
  }

  // 5. Cascade routing loop
  while (eligibleProviders.length > 0) {
    const totalWeight = eligibleProviders.reduce((sum, curr) => sum + curr.priority, 0);
    const randomWeight = Math.random() * totalWeight;

    let currentWeight = 0;
    let selectedIndex = 0;
    for (let i = 0; i < eligibleProviders.length; i++) {
      currentWeight += eligibleProviders[i].priority;
      if (randomWeight <= currentWeight) {
        selectedIndex = i;
        break;
      }
    }

    const selectedSetting = eligibleProviders[selectedIndex];
    const providerKey = `${selectedSetting.provider}:${selectedSetting.model_name}`;

    // Verify 3-state circuit breaker status
    const status = await resilienceStore.getProviderStatus(providerKey);
    if (status.state === "open") {
      log.warn(`[AIGateway] Circuit breaker for ${providerKey} is OPEN. Skipping...`, correlationId);
      eligibleProviders.splice(selectedIndex, 1);
      continue;
    }

    // Verify adapter health check
    const adapter = getAdapterForSetting(selectedSetting);
    const isHealthy = await adapter.healthCheck();
    if (!isHealthy) {
      log.warn(`[AIGateway] Provider ${providerKey} failed healthcheck. Skipping...`, correlationId);
      eligibleProviders.splice(selectedIndex, 1);
      continue;
    }

    // Check feature flag for caching
    const cacheEnabled = await isFeatureEnabled("ai_cache", userId);
    const systemPromptHash = options?.systemPromptVersion || "default";
    const cacheKey = generateCacheKey(
      selectedSetting.provider,
      selectedSetting.model_name,
      options?.temperature || 0.1,
      systemPromptHash,
      prompt
    );

    if (cacheEnabled && !options?.bypassCache) {
      const cached = await aiCacheManager.get(cacheKey);
      if (cached) {
        if (cached.isNegative) {
          log.warn(`[AIGateway] Negative cache hit for ${providerKey}. Skipping to avoid rate limits...`, correlationId);
          eligibleProviders.splice(selectedIndex, 1);
          continue;
        }
        log.info(`[AIGateway] Cache HIT for key: ${cacheKey.substring(0, 8)}`, correlationId);
        
        // Record telemetry hit metrics asynchronously
        recordAiTelemetry(providerKey, true, 0, cached.tokensUsed || 0).catch(() => {});
        
        return cached;
      }
    }

    // 6. Execute model call via Single Flight coalescer
    try {
      const start = Date.now();
      const result = await singleFlight.execute(cacheKey, async () => {
        let attempt = 0;
        const maxAttempts = options?.bypassCache ? 1 : config.ai.maxRetries;

        while (attempt < maxAttempts) {
          try {
            log.info(`[AIGateway] Calling ${providerKey} (attempt ${attempt + 1}/${maxAttempts})...`, correlationId);
            const res = await adapter.generateText(prompt, options);

            // Record success on circuit breaker
            await resilienceStore.recordSuccess(providerKey);

            // Save to cache
            if (cacheEnabled) {
              await aiCacheManager.set(cacheKey, res, options);
            }

            return res;
          } catch (err: any) {
            attempt++;
            if (attempt >= maxAttempts) {
              throw err;
            }
            const delay = Math.pow(2, attempt) * 1000;
            log.warn(`[AIGateway] ${providerKey} error: ${err.message}. Retrying in ${delay}ms...`, correlationId);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        throw new Error("API call terminated without response.");
      });

      const latency = Date.now() - start;

      // Raise operational warning alert if latency > 10,000ms
      if (latency > 10000) {
        await alertManager.triggerAlert(
          "warning",
          "High Latency Warning",
          `Provider ${providerKey} responded with high latency: ${latency}ms`,
          userId,
          correlationId
        );
      }

      // Record telemetry miss metrics asynchronously
      recordAiTelemetry(providerKey, false, latency, result.tokensUsed || 0).catch(() => {});

      return result;
    } catch (err: any) {
      log.error(`[AIGateway] execution failed for ${providerKey}: ${err.message}`, correlationId);
      
      // Record failure on circuit breaker
      const finalState = await resilienceStore.recordFailure(providerKey);

      // Trigger critical alert when circuit breaker transitions to OPEN state
      if (finalState === "open") {
        await alertManager.triggerAlert(
          "error",
          "Circuit Breaker Tripped",
          `The circuit breaker for ${providerKey} has been tripped to OPEN state after consecutive failures.`,
          userId,
          correlationId
        );
      }

      // Write negative cache entry for transient errors
      if (cacheEnabled) {
        await aiCacheManager.set(
          cacheKey, 
          { text: "transient provider failure" }, 
          options, 
          true
        );
      }

      // Record negative telemetry metrics asynchronously
      recordAiTelemetry(providerKey, false, 0, 0, true).catch(() => {});

      eligibleProviders.splice(selectedIndex, 1);
    }
  }

  log.warn("[AIGateway] All eligible providers failed/skipped. Routing to fallback default Gemini.", correlationId);
  return callFallbackGemini(prompt, options);
}

/**
 * Fallback direct invocation for Gemini using process.env configurations.
 */
async function callFallbackGemini(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
  const defaultKey = process.env.GEMINI_API_KEY;
  if (!defaultKey) {
    throw new Error("No LLM settings configured and default GEMINI_API_KEY environment is missing.");
  }
  const fallbackSetting: LLMSetting = {
    provider: "gemini",
    api_key: defaultKey,
    model_name: "gemini-2.0-flash-lite",
    priority: 1,
    is_enabled: true
  };
  const adapter = getAdapterForSetting(fallbackSetting);
  return adapter.generateText(prompt, options);
}

