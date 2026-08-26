/** SellerPlus centralized, tenant-scoped AI gateway utilities. */
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { getAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/encryption";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { config } from "@/lib/config";
import type { GenerationOptions, GenerationResult, LLMSetting } from "./types";
import { getAdapterForSetting, PROVIDER_CAPABILITIES } from "./adapters";
import { generateCacheKey, aiCacheManager } from "./cache";
import { resilienceStore } from "./resilience-store";
import { singleFlight } from "./single-flight";
import { getAIRequestContext } from "./request-context";
import {
  abortableDelay,
  assertExecutionActive,
  ExecutionDeadlineError,
} from "@/lib/execution-deadline";
import { AIBudgetError, reserveAIRequestBudget } from "./budget";
import { log } from "@/lib/logger";

const geminiKey = process.env.GEMINI_API_KEY || "";
const geminiClient = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
const MAX_SCRAPE_BYTES = 2 * 1024 * 1024;
const allowedAmazonHosts = new Set([
  "amazon.in", "www.amazon.in",
  "amazon.com", "www.amazon.com",
  "amazon.co.uk", "www.amazon.co.uk",
  "amazon.co.jp", "www.amazon.co.jp",
  "amazon.ae", "www.amazon.ae",
  "amazon.ca", "www.amazon.ca",
]);

export function getModel(modelName = "gemini-2.0-flash-lite"): GenerativeModel {
  if (!geminiClient) throw new Error("Gemini API is not configured.");
  return geminiClient.getGenerativeModel({ model: modelName });
}

/** Compatibility check; tenant providers are resolved inside the request scope. */
export function isAiAvailable(): boolean {
  return Boolean(
    getAIRequestContext()?.workspaceId ||
    process.env.OPENROUTER_API_KEY ||
    process.env.NVIDIA_API_KEY ||
    process.env.GEMINI_API_KEY,
  );
}

export function cleanHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 15_000);
}

export function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.substring(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3);
  return cleaned.trim();
}

export function parseAiJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(cleanJsonResponse(text)) as T;
  } catch {
    return fallback;
  }
}

export interface ScrapeResult {
  title: string;
  price: string;
  body: string;
  blocked: boolean;
}

function validateAmazonUrl(value: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || !allowedAmazonHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error("Only supported public Amazon listing URLs can be analyzed.");
  }
  if (parsed.username || parsed.password || parsed.port) {
    throw new Error("Amazon listing URL contains unsupported credentials or port information.");
  }
  return parsed;
}

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SCRAPE_BYTES) throw new Error("Listing page is too large to analyze.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SCRAPE_BYTES) {
      await reader.cancel();
      throw new Error("Listing page is too large to analyze.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function scrapeUrlText(value: string): Promise<ScrapeResult> {
  try {
    let target = validateAmazonUrl(value);
    let response: Response | null = null;
    for (let redirect = 0; redirect < 4; redirect += 1) {
      response = await fetch(target, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.8",
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
        redirect: "manual",
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("Amazon returned an invalid redirect.");
      target = validateAmazonUrl(new URL(location, target).toString());
    }
    if (!response?.ok) return { title: "", price: "", body: "", blocked: true };
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return { title: "", price: "", body: "", blocked: true };
    }

    const html = await readBoundedText(response);
    if (/captcha|unusual traffic|robot check/i.test(html)) {
      return { title: "", price: "", body: "", blocked: true };
    }
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]
      ?.replace(/- Amazon\.(in|com|co\.uk|co\.jp|ae|ca)/i, "")
      .trim() ?? "";
    const price = (
      html.match(/class="[^"]*a-price-whole[^"]*"[^>]*>([^<]+)</i) ||
      html.match(/id="priceblock_ourprice"[^>]*>([^<]+)/i)
    )?.[1]?.trim() ?? "N/A";
    return { title, price, body: cleanHtml(html), blocked: false };
  } catch {
    return { title: "", price: "", body: "", blocked: true };
  }
}

const injectionPatterns = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /<\/?(system|assistant|user|human|ai)\s*>/i,
  /\[(SYSTEM|INST)\]/i,
  /system\s+override/i,
  /jailbreak/i,
  /you\s+are\s+now\s+(an?\s+)?(unrestricted|jailbroken)/i,
];

export function sanitizePrompt(prompt: string, correlationId?: string): void {
  if (prompt.length > 250_000) throw new Error("AI prompt exceeds the configured safety limit.");
  for (const pattern of injectionPatterns) {
    if (pattern.test(prompt)) {
      log.warn("[AIGateway] Prompt injection pattern blocked.", correlationId, {
        pattern: pattern.source,
      });
      throw new Error("Untrusted content contains an unsafe instruction pattern.");
    }
  }
}

function packCredential(row: {
  key_version: string;
  initialization_vector: string;
  authentication_tag: string;
  ciphertext: string;
}) {
  return [
    "spenc", "1", row.key_version, row.initialization_vector,
    row.authentication_tag, row.ciphertext,
  ].join(":");
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function tenantProviderSettings(workspaceId: string): Promise<LLMSetting[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("integration_credentials")
    .select("provider, ciphertext, initialization_vector, authentication_tag, key_version, credential_metadata")
    .eq("workspace_id", workspaceId)
    .eq("credential_kind", "api_key")
    .is("marketplace_account_id", null);
  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const metadata = row.credential_metadata as Record<string, unknown> | null;
    if (metadata?.enabled !== true || typeof metadata.modelName !== "string") return [];
    try {
      return [{
        provider: row.provider,
        api_key: decryptToken(packCredential(row)),
        model_name: metadata.modelName,
        input_cost_per_million: optionalNonNegativeNumber(metadata.inputCostPerMillion),
        output_cost_per_million: optionalNonNegativeNumber(metadata.outputCostPerMillion),
        priority: typeof metadata.priority === "number" ? metadata.priority : 50,
        is_enabled: true,
      } satisfies LLMSetting];
    } catch (error) {
      log.error("[AIGateway] Unable to decrypt a configured provider.", undefined, {
        provider: row.provider,
        error: error instanceof Error ? error.message : "decryption failed",
      });
      return [];
    }
  });
}

function environmentProviderSettings(): LLMSetting[] {
  const settings: LLMSetting[] = [];
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_DEFAULT_MODEL) {
    settings.push({
      provider: "openrouter",
      api_key: process.env.OPENROUTER_API_KEY,
      model_name: process.env.OPENROUTER_DEFAULT_MODEL,
      input_cost_per_million: optionalNonNegativeNumber(process.env.OPENROUTER_INPUT_COST_PER_MILLION),
      output_cost_per_million: optionalNonNegativeNumber(process.env.OPENROUTER_OUTPUT_COST_PER_MILLION),
      priority: 80,
      is_enabled: true,
    });
  }
  if (process.env.NVIDIA_API_KEY && process.env.NVIDIA_DEFAULT_MODEL) {
    settings.push({
      provider: "nvidia",
      api_key: process.env.NVIDIA_API_KEY,
      model_name: process.env.NVIDIA_DEFAULT_MODEL,
      input_cost_per_million: optionalNonNegativeNumber(process.env.NVIDIA_INPUT_COST_PER_MILLION),
      output_cost_per_million: optionalNonNegativeNumber(process.env.NVIDIA_OUTPUT_COST_PER_MILLION),
      priority: 90,
      is_enabled: true,
    });
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_DEFAULT_MODEL) {
    settings.push({
      provider: "gemini",
      api_key: process.env.GEMINI_API_KEY,
      model_name: process.env.GEMINI_DEFAULT_MODEL,
      input_cost_per_million: optionalNonNegativeNumber(process.env.GEMINI_INPUT_COST_PER_MILLION),
      output_cost_per_million: optionalNonNegativeNumber(process.env.GEMINI_OUTPUT_COST_PER_MILLION),
      priority: 100,
      is_enabled: true,
    });
  }
  return settings;
}

async function recordAiUsage(input: {
  workspaceId?: string;
  userId?: string;
  feature: string;
  provider: string;
  model: string;
  result?: GenerationResult;
  latencyMs: number;
  status: "succeeded" | "failed" | "cached" | "blocked";
  correlationId: string;
}) {
  if (!input.workspaceId) return;
  try {
    const costStatus = input.status === "cached"
      ? "not_applicable"
      : input.result?.costStatus ?? "unknown";
    const costMicros = costStatus === "unknown"
      ? null
      : costStatus === "not_applicable"
        ? 0
        : Math.max(0, Math.round((input.result?.estimatedCost ?? 0) * 1_000_000));
    const { error } = await getAdminClient().rpc("record_workspace_ai_usage", {
      p_workspace_id: input.workspaceId,
      p_user_id: input.userId ?? null,
      p_feature: input.feature,
      p_provider: input.provider,
      p_model: input.model,
      p_input_tokens: input.result?.inputTokens ?? 0,
      p_output_tokens: input.result?.outputTokens ?? input.result?.tokensUsed ?? 0,
      p_cost_micros: costMicros,
      p_cost_status: costStatus,
      p_latency_ms: Math.max(0, input.latencyMs),
      p_status: input.status,
      p_correlation_id: input.correlationId,
    });
    if (error) throw error;
  } catch (error) {
    log.warn("[AIGateway] AI usage record failed.", input.correlationId, {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function routeLLMRequest(
  prompt: string,
  userId?: string,
  options?: GenerationOptions,
): Promise<GenerationResult> {
  const requestContext = getAIRequestContext();
  const workspaceId = options?.workspaceId ?? requestContext?.workspaceId;
  const effectiveUserId = userId ?? requestContext?.userId;
  const feature = options?.feature ?? requestContext?.feature ?? "unclassified";
  const correlationId = options?.correlationId ?? crypto.randomUUID();
  const requestOptions: GenerationOptions = {
    ...options,
    deadlineAt: options?.deadlineAt ?? requestContext?.deadlineAt,
    signal: options?.signal ?? requestContext?.signal,
  };
  assertExecutionActive(requestOptions);
  sanitizePrompt(prompt, correlationId);

  const featureContext = { workspaceId, userId: effectiveUserId };
  if (!(await isFeatureEnabled("ai_gateway", featureContext))) {
    throw new Error("SellerPlus AI is disabled for this environment.");
  }

  const tenantSettings = workspaceId ? await tenantProviderSettings(workspaceId) : [];
  const requiredCapabilities = requestOptions.capabilities ?? [];
  const providers = [...tenantSettings, ...environmentProviderSettings()]
    .filter((setting, index, all) =>
      all.findIndex((candidate) =>
        candidate.provider === setting.provider && candidate.model_name === setting.model_name,
      ) === index,
    )
    .filter((setting) => {
      if (requestOptions.provider && setting.provider !== requestOptions.provider) return false;
      if (requestOptions.model && setting.model_name !== requestOptions.model) return false;
      const capabilities = PROVIDER_CAPABILITIES[setting.provider] ?? [];
      return requiredCapabilities.every((capability) => capabilities.includes(capability));
    })
    .sort((left, right) => left.priority - right.priority);

  if (providers.length === 0) {
    throw new Error("No eligible AI provider is configured for this task.");
  }

  let lastError: Error | null = null;
  for (const setting of providers) {
    assertExecutionActive(requestOptions, 1_000);
    const providerKey = `${setting.provider}:${setting.model_name}`;
    if (workspaceId) {
      const status = await resilienceStore.getProviderStatus(workspaceId, providerKey);
      if (status.state === "open") continue;
    }

    const adapter = getAdapterForSetting(setting);
    if (!(await adapter.healthCheck())) continue;
    const cacheEnabled = Boolean(workspaceId) && await isFeatureEnabled("ai_cache", featureContext);
    const cacheKey = generateCacheKey(
      setting.provider,
      setting.model_name,
      requestOptions.temperature ?? 0.1,
      requestOptions.systemPromptVersion ?? "default",
      `${workspaceId}:${prompt}`,
    );

    if (cacheEnabled && workspaceId && !requestOptions.bypassCache) {
      const cached = await aiCacheManager.get(cacheKey, workspaceId);
      if (cached && !cached.isNegative) {
        await recordAiUsage({
          workspaceId,
          userId: effectiveUserId,
          feature,
          provider: setting.provider,
          model: setting.model_name,
          result: cached,
          latencyMs: 0,
          status: "cached",
          correlationId,
        });
        return { ...cached, provider: setting.provider, model: setting.model_name };
      }
      if (cached?.isNegative) continue;
    }

    const startedAt = Date.now();
    try {
      const flight = await singleFlight.execute(cacheKey, async () => {
        const maxAttempts = requestOptions.bypassCache ? 1 : Math.max(1, config.ai.maxRetries);
        if (workspaceId) {
          await reserveAIRequestBudget({
            workspaceId,
            correlationId,
            setting,
            prompt,
            options: requestOptions,
            attempts: maxAttempts,
          });
        }
        let attempt = 0;
        while (attempt < maxAttempts) {
          assertExecutionActive(requestOptions, 1_000);
          try {
            return await adapter.generateText(prompt, requestOptions);
          } catch (error) {
            if (error instanceof ExecutionDeadlineError || requestOptions.signal?.aborted) {
              throw new ExecutionDeadlineError();
            }
            attempt += 1;
            if (attempt >= maxAttempts) throw error;
            const delay = Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
            await abortableDelay(delay, requestOptions, 1_000);
          }
        }
        throw new Error("AI provider did not return a result.");
      });
      const result = flight.value;

      if (!flight.executed) {
        await recordAiUsage({
          workspaceId,
          userId: effectiveUserId,
          feature,
          provider: setting.provider,
          model: setting.model_name,
          result,
          latencyMs: Date.now() - startedAt,
          status: "cached",
          correlationId,
        });
        return { ...result, provider: setting.provider, model: setting.model_name };
      }

      if (workspaceId) {
        await resilienceStore.recordSuccess(workspaceId, providerKey);
        if (cacheEnabled) await aiCacheManager.set(cacheKey, workspaceId, result, requestOptions);
      }
      await recordAiUsage({
        workspaceId,
        userId: effectiveUserId,
        feature,
        provider: setting.provider,
        model: setting.model_name,
        result,
        latencyMs: Date.now() - startedAt,
        status: "succeeded",
        correlationId,
      });
      return { ...result, provider: setting.provider, model: setting.model_name };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("AI provider request failed.");
      if (lastError instanceof ExecutionDeadlineError || requestOptions.signal?.aborted) {
        throw new ExecutionDeadlineError();
      }
      if (lastError instanceof AIBudgetError) {
        await recordAiUsage({
          workspaceId,
          userId: effectiveUserId,
          feature,
          provider: setting.provider,
          model: setting.model_name,
          latencyMs: Date.now() - startedAt,
          status: "blocked",
          correlationId,
        });
        throw lastError;
      }
      if (workspaceId) {
        await resilienceStore.recordFailure(workspaceId, providerKey);
        if (cacheEnabled) {
          await aiCacheManager.set(
            cacheKey,
            workspaceId,
            { text: "provider temporarily unavailable" },
            requestOptions,
            true,
          );
        }
      }
      await recordAiUsage({
        workspaceId,
        userId: effectiveUserId,
        feature,
        provider: setting.provider,
        model: setting.model_name,
        latencyMs: Date.now() - startedAt,
        status: "failed",
        correlationId,
      });
      log.warn("[AIGateway] Provider failed; trying the next eligible route.", correlationId, {
        provider: setting.provider,
        model: setting.model_name,
        error: lastError.message,
      });
    }
  }

  throw new Error(lastError ? "All eligible AI providers failed." : "No healthy AI provider is available.");
}
