/**
 * SellerPlus OS — Typed Job Handler Registry
 *
 * Central registry mapping every job type to its:
 *   - handler (async function that performs the actual work)
 *   - priority (lower = higher priority in bi_jobs queue)
 *   - retryPolicy (max attempts before permanent failure)
 *   - capabilities (labels used for observability / routing decisions)
 *   - notificationTitle (shown to users when job completes)
 *
 * Adding a new job type requires ONLY a new entry in JOB_REGISTRY.
 * The bi-processor worker and task-scheduler read this registry at runtime —
 * no switch statements, no scattered dispatch logic.
 *
 * All handlers receive a standardised JobContext and return JobHandlerResult.
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JobContext {
  jobId: string;
  userId: string;
  payload: Record<string, unknown>;
  supabaseAdmin: SupabaseClient;
  scheduleId?: string;
}

export interface JobHandlerResult {
  /** Structured output stored in bi_jobs.result */
  output: Record<string, unknown>;
  /** Short summary for the completion notification */
  summary: string;
  /** List of affected entity identifiers (SKUs, order IDs, etc.) */
  affectedEntities?: string[];
  /** Estimated AI token cost in USD */
  estimatedCostUsd?: number;
}

export type JobHandler = (ctx: JobContext) => Promise<JobHandlerResult>;

export type JobCapability =
  | "ai_analysis"
  | "inventory"
  | "advertising"
  | "listing_creation"
  | "warehouse"
  | "reporting"
  | "keywords";

export interface JobRegistryEntry {
  /** Human-readable display name */
  name: string;
  /** Async function that performs the work */
  handler: JobHandler;
  /** Default bi_jobs.priority (1 = highest, 10 = lowest) */
  priority: number;
  retryPolicy: {
    maxAttempts: number;
    /** Backoff strategy — currently informational; future retry delay calculation */
    strategy: "immediate" | "exponential";
  };
  capabilities: JobCapability[];
  /** Toast/notification title shown on completion */
  notificationTitle: string;
}

// ─── Job Type Enum ───────────────────────────────────────────────────────────

export type JobType =
  | "bi_analysis"
  | "executive_assistant"
  | "audit_ads"
  | "check_inventory"
  | "generate_report"
  | "create_listing_draft"
  | "find_keywords"
  | "detect_low_profit_asin";

// ─── Handler Implementations ─────────────────────────────────────────────────
// Each handler is a thin adapter — it calls the appropriate existing service
// and returns a standardized JobHandlerResult.

async function handleBiAnalysis(ctx: JobContext): Promise<JobHandlerResult> {
  const { BIEngine } = await import("@/lib/ai/bi-engine");
  const mode = (ctx.payload.mode as string) || "Store Audit";
  const goal = (ctx.payload.goal as string) || "MAXIMIZE_PROFIT";
  const customPrompt = ctx.payload.customPrompt as string | undefined;
  const result = await BIEngine.runAnalysis(ctx.userId, mode as any, goal, customPrompt);
  return {
    output: result as unknown as Record<string, unknown>,
    summary: `${mode} complete — ${result.recommendations.length} recommendations generated.`,
    affectedEntities: result.recommendations.map((r) => r.id),
    estimatedCostUsd: 0.002,
  };
}

async function handleExecutiveAssistant(ctx: JobContext): Promise<JobHandlerResult> {
  const { BIEngine } = await import("@/lib/ai/bi-engine");
  const result = await BIEngine.runAnalysis(ctx.userId, "Executive Summary", "MAXIMIZE_PROFIT");
  return {
    output: result as unknown as Record<string, unknown>,
    summary: `Executive Report ready — ${result.recommendations.length} strategic actions identified.`,
    affectedEntities: result.recommendations.map((r) => r.id),
    estimatedCostUsd: 0.003,
  };
}

async function handleAuditAds(ctx: JobContext): Promise<JobHandlerResult> {
  const { BIEngine } = await import("@/lib/ai/bi-engine");
  const result = await BIEngine.runAnalysis(ctx.userId, "Advertising Audit", "REDUCE_ACOS");
  return {
    output: result as unknown as Record<string, unknown>,
    summary: `Ads Audit complete — ${result.recommendations.length} PPC optimisations found.`,
    estimatedCostUsd: 0.002,
  };
}

async function handleCheckInventory(ctx: JobContext): Promise<JobHandlerResult> {
  const { BIEngine } = await import("@/lib/ai/bi-engine");
  const result = await BIEngine.runAnalysis(ctx.userId, "Inventory Audit", "PREVENT_STOCKOUT");
  return {
    output: result as unknown as Record<string, unknown>,
    summary: `Inventory scan complete — ${result.recommendations.length} stock alerts.`,
    estimatedCostUsd: 0.001,
  };
}

async function handleGenerateReport(ctx: JobContext): Promise<JobHandlerResult> {
  const { BIEngine } = await import("@/lib/ai/bi-engine");
  const result = await BIEngine.runAnalysis(ctx.userId, "Store Audit", "MAXIMIZE_PROFIT");
  return {
    output: result as unknown as Record<string, unknown>,
    summary: `Weekly Business Report generated — ${result.widgets.length} dashboard widgets.`,
    estimatedCostUsd: 0.003,
  };
}

async function handleCreateListingDraft(ctx: JobContext): Promise<JobHandlerResult> {
  const { generateListingDraft } = await import("@/lib/ai/listing-draft");
  const result = await generateListingDraft(ctx.userId, ctx.payload, ctx.supabaseAdmin);
  return {
    output: { listingId: result.listingId, title: result.title },
    summary: `Listing draft "${result.title}" created. Review before publishing.`,
    affectedEntities: [result.listingId],
    estimatedCostUsd: 0.004,
  };
}

async function handleFindKeywords(ctx: JobContext): Promise<JobHandlerResult> {
  const { generateKeywords } = await import("@/lib/ai/keyword-engine");
  
  const productName = ctx.payload?.productName || "My Amazon Product";
  const category = ctx.payload?.category || "General";
  const competitors = ctx.payload?.competitors || "Top ranking competitors";

  const result = await generateKeywords(productName, category, competitors, ctx.userId);
  
  return {
    output: { keywords: result } as unknown as Record<string, unknown>,
    summary: `Keyword analysis complete — generated ${result.length} highly optimized keywords.`,
    estimatedCostUsd: 0.002,
  };
}

async function handleDetectLowProfitAsin(ctx: JobContext): Promise<JobHandlerResult> {
  const { BIEngine } = await import("@/lib/ai/bi-engine");
  const result = await BIEngine.runAnalysis(ctx.userId, "Store Audit", "ELIMINATE_LOSS_MAKERS");
  return {
    output: result as unknown as Record<string, unknown>,
    summary: `Profit leak scan complete — ${result.recommendations.length} ASINs flagged.`,
    estimatedCostUsd: 0.002,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const JOB_REGISTRY: Record<JobType, JobRegistryEntry> = {
  bi_analysis: {
    name: "BI Analysis",
    handler: handleBiAnalysis,
    priority: 3,
    retryPolicy: { maxAttempts: 3, strategy: "exponential" },
    capabilities: ["ai_analysis", "reporting"],
    notificationTitle: "BI Analysis Complete",
  },
  executive_assistant: {
    name: "AI Executive Assistant",
    handler: handleExecutiveAssistant,
    priority: 2,
    retryPolicy: { maxAttempts: 2, strategy: "exponential" },
    capabilities: ["ai_analysis", "reporting"],
    notificationTitle: "Executive Report Ready",
  },
  audit_ads: {
    name: "Ads Audit",
    handler: handleAuditAds,
    priority: 3,
    retryPolicy: { maxAttempts: 3, strategy: "exponential" },
    capabilities: ["advertising", "ai_analysis"],
    notificationTitle: "Ads Audit Complete",
  },
  check_inventory: {
    name: "Inventory Check",
    handler: handleCheckInventory,
    priority: 2,
    retryPolicy: { maxAttempts: 3, strategy: "immediate" },
    capabilities: ["inventory"],
    notificationTitle: "Inventory Alert",
  },
  generate_report: {
    name: "Weekly Business Report",
    handler: handleGenerateReport,
    priority: 5,
    retryPolicy: { maxAttempts: 2, strategy: "exponential" },
    capabilities: ["reporting", "ai_analysis"],
    notificationTitle: "Weekly Report Ready",
  },
  create_listing_draft: {
    name: "Draft Listing Creator",
    handler: handleCreateListingDraft,
    priority: 4,
    retryPolicy: { maxAttempts: 2, strategy: "exponential" },
    capabilities: ["listing_creation", "ai_analysis"],
    notificationTitle: "Listing Draft Generated",
  },
  find_keywords: {
    name: "Keyword Research",
    handler: handleFindKeywords,
    priority: 5,
    retryPolicy: { maxAttempts: 2, strategy: "exponential" },
    capabilities: ["keywords", "ai_analysis"],
    notificationTitle: "Keyword Research Complete",
  },
  detect_low_profit_asin: {
    name: "Low-Profit ASIN Detector",
    handler: handleDetectLowProfitAsin,
    priority: 4,
    retryPolicy: { maxAttempts: 2, strategy: "exponential" },
    capabilities: ["ai_analysis", "reporting"],
    notificationTitle: "Profit Leak Scan Complete",
  },
};

/**
 * Look up a registry entry by job type string.
 * Returns undefined for unknown job types — callers must handle this case.
 */
export function getJobEntry(jobType: string): JobRegistryEntry | undefined {
  return JOB_REGISTRY[jobType as JobType];
}

/** All known job type keys */
export const ALL_JOB_TYPES = Object.keys(JOB_REGISTRY) as JobType[];
