/**
 * SellerPlus OS — Automation Rule Engine
 * 
 * A production-grade, rule-based automation engine that evaluates business
 * conditions and executes actions autonomously. Every automation is:
 * - Logged with a full audit trail
 * - Risk-scored (low/medium/high)
 * - Confidence-scored (0-100)
 * - Reversible (rollback strategy documented)
 * - Approval-gated for high-risk actions
 * 
 * Built-in automations:
 *   1. Auto-pause bleeding PPC campaigns
 *   2. Stockout restock alerts
 *   3. Negative keyword harvesting
 *   4. Budget redistribution suggestions
 *   5. Price competitiveness monitoring
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ───────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";
export type AutomationStatus = "pending" | "approved" | "executed" | "rejected" | "failed" | "rolled_back";
export type TriggerType = "schedule" | "threshold" | "event";

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  category: string;
  triggerType: TriggerType;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  isEnabled: boolean;
  evaluate: (ctx: AutomationContext) => Promise<AutomationEvaluation | null>;
  execute: (ctx: AutomationContext, evaluation: AutomationEvaluation) => Promise<AutomationResult>;
  rollback?: (ctx: AutomationContext, rollbackData: any) => Promise<AutomationResult>;
}

export interface AutomationContext {
  userId: string;
  supabase: SupabaseClient;
}

export interface AutomationEvaluation {
  ruleId: string;
  ruleName: string;
  shouldExecute: boolean;
  confidence: number;            // 0-100
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  description: string;
  estimatedImpact: string;
  affectedEntities: string[];    // SKUs, campaign IDs, etc.
  suggestedAction: string;
  rollbackStrategy: string;
  metadata: Record<string, any>;
}

export interface AutomationResult {
  success: boolean;
  message: string;
  changes: string[];
  canRollback: boolean;
  rollbackData?: Record<string, any>;
}

export interface AutomationLogEntry {
  user_id: string;
  rule_id: string;
  rule_name: string;
  category: string;
  risk_level: RiskLevel;
  status: AutomationStatus;
  confidence: number;
  description: string;
  estimated_impact: string;
  affected_entities: string[];
  action_taken: string;
  result_message: string | null;
  rollback_data: Record<string, any> | null;
  executed_at: string | null;
}

// ─── Built-in Rules ──────────────────────────────────────────────────

const RULE_PAUSE_BLEEDING_CAMPAIGNS: AutomationRule = {
  id: "auto_pause_high_acos",
  name: "Auto-Pause Bleeding Campaigns",
  description: "Pauses PPC campaigns with ACOS consistently above 50% to stop advertising waste.",
  category: "ppc",
  triggerType: "threshold",
  riskLevel: "medium",
  requiresApproval: true,
  isEnabled: true,

  evaluate: async (ctx) => {
    const { data: campaigns } = await ctx.supabase
      .from("advertising_campaigns")
      .select("campaign_id, name, spend, sales, status")
      .eq("user_id", ctx.userId)
      .eq("status", "ENABLED");

    if (!campaigns) return null;

    const bleeding = campaigns.filter((c) => {
      const spend = Number(c.spend) || 0;
      const sales = Number(c.sales) || 0;
      if (spend <= 0) return false;
      const acos = sales > 0 ? (spend / sales) * 100 : 100;
      return acos > 50;
    });

    if (bleeding.length === 0) return null;

    const totalWaste = bleeding.reduce((sum, c) => {
      const spend = Number(c.spend) || 0;
      const sales = Number(c.sales) || 0;
      return sum + Math.max(0, spend - sales * 0.3);
    }, 0);

    return {
      ruleId: "auto_pause_high_acos",
      ruleName: "Auto-Pause Bleeding Campaigns",
      shouldExecute: true,
      confidence: 85,
      riskLevel: "medium",
      requiresApproval: true,
      description: `${bleeding.length} campaign(s) have ACOS above 50% and are draining advertising budget.`,
      estimatedImpact: `₹${Math.round(totalWaste).toLocaleString()} potential monthly savings`,
      affectedEntities: bleeding.map((c) => c.campaign_id),
      suggestedAction: `Pause ${bleeding.length} campaign(s): ${bleeding.map((c) => c.name).join(", ")}`,
      rollbackStrategy: "Re-enable campaigns and restore original status to ENABLED.",
      metadata: { campaigns: bleeding },
    };
  },

  execute: async (ctx, evaluation) => {
    const campaignIds = evaluation.affectedEntities;
    const changes: string[] = [];

    for (const campId of campaignIds) {
      await ctx.supabase
        .from("advertising_campaigns")
        .update({ status: "PAUSED" })
        .eq("user_id", ctx.userId)
        .eq("campaign_id", campId);

      changes.push(`Paused campaign: ${campId}`);
    }

    return {
      success: true,
      message: `Paused ${campaignIds.length} bleeding campaign(s).`,
      changes,
      canRollback: true,
      rollbackData: { campaignIds, previousStatus: "ENABLED" },
    };
  },

  rollback: async (ctx, rollbackData) => {
    const campaignIds = rollbackData?.campaignIds || [];
    const previousStatus = rollbackData?.previousStatus || "ENABLED";
    const changes: string[] = [];

    for (const campId of campaignIds) {
      await ctx.supabase
        .from("advertising_campaigns")
        .update({ status: previousStatus })
        .eq("user_id", ctx.userId)
        .eq("campaign_id", campId);

      changes.push(`Restored campaign: ${campId} status to ${previousStatus}`);
    }

    return {
      success: true,
      message: `Rolled back campaign pause. Restored status for ${campaignIds.length} campaign(s).`,
      changes,
      canRollback: false,
    };
  },
};

const RULE_RESTOCK_ALERT: AutomationRule = {
  id: "auto_restock_alert",
  name: "Automatic Restock Alerts",
  description: "Generates restock recommendations when inventory will run out within 7 days.",
  category: "inventory",
  triggerType: "threshold",
  riskLevel: "low",
  requiresApproval: false,
  isEnabled: true,

  evaluate: async (ctx) => {
    const { data: listings } = await ctx.supabase
      .from("listings")
      .select("sku, title, available_qty, sales_30d, incoming_qty, reorder_qty")
      .eq("user_id", ctx.userId);

    if (!listings) return null;

    const atRisk = listings.filter((l) => {
      const stock = Number(l.available_qty) || 0;
      const velocity = (Number(l.sales_30d) || 0) / 30;
      const incoming = Number(l.incoming_qty) || 0;
      if (velocity <= 0 || stock <= 0) return false;
      const daysLeft = Math.ceil(stock / velocity);
      return daysLeft <= 7 && incoming === 0;
    });

    if (atRisk.length === 0) return null;

    return {
      ruleId: "auto_restock_alert",
      ruleName: "Automatic Restock Alerts",
      shouldExecute: true,
      confidence: 95,
      riskLevel: "low",
      requiresApproval: false,
      description: `${atRisk.length} product(s) will run out of stock within 7 days.`,
      estimatedImpact: `Prevent stockout on ${atRisk.length} SKU(s)`,
      affectedEntities: atRisk.map((l) => l.sku),
      suggestedAction: `Generate restock recommendations for: ${atRisk.map((l) => l.sku).join(", ")}`,
      rollbackStrategy: "No destructive changes. Alert-only automation.",
      metadata: { listings: atRisk },
    };
  },

  execute: async (ctx, evaluation) => {
    const skus = evaluation.affectedEntities;

    // Idempotency: Filter out SKUs that already have an active restock alert
    const { data: activeAlerts } = await ctx.supabase
      .from("alert_logs")
      .select("message")
      .eq("user_id", ctx.userId)
      .eq("type", "out_of_stock_risk")
      .eq("is_read", false);

    const activeSkuAlerts = new Set(
      (activeAlerts || []).map((a: any) => {
        const match = a.message.match(/SKU ([\w-]+)/);
        return match ? match[1] : null;
      }).filter(Boolean)
    );

    const newSkus = skus.filter((sku) => !activeSkuAlerts.has(sku));
    if (newSkus.length === 0) {
      return {
        success: true,
        message: "No new restock alerts needed; active alerts already exist.",
        changes: [],
        canRollback: false,
      };
    }

    // Create alert_logs entries for each new at-risk SKU
    const alerts = newSkus.map((sku) => ({
      user_id: ctx.userId,
      type: "out_of_stock_risk",
      title: `Restock Needed: ${sku}`,
      message: `SKU ${sku} will run out within 7 days at current sales velocity. No incoming shipment detected.`,
      is_read: false,
    }));

    const { data: insertedAlerts, error } = await ctx.supabase
      .from("alert_logs")
      .insert(alerts)
      .select("id");

    if (error) throw error;

    const alertIds = (insertedAlerts || []).map((a: any) => a.id);

    return {
      success: true,
      message: `Generated restock alerts for ${newSkus.length} SKU(s).`,
      changes: newSkus.map((sku) => `Created restock alert for SKU: ${sku}`),
      canRollback: true,
      rollbackData: { alertIds },
    };
  },

  rollback: async (ctx, rollbackData) => {
    const alertIds = rollbackData?.alertIds || [];
    if (alertIds.length > 0) {
      await ctx.supabase
        .from("alert_logs")
        .delete()
        .in("id", alertIds);
    }
    return {
      success: true,
      message: `Removed ${alertIds.length} restock alert(s).`,
      changes: alertIds.map((id: string) => `Deleted alert: ${id}`),
      canRollback: false,
    };
  },
};

const RULE_MISSING_COST_DETECTOR: AutomationRule = {
  id: "auto_detect_missing_costs",
  name: "Missing Cost Profile Detector",
  description: "Flags SKUs with active sales but no cost profile — meaning profit calculations are blind.",
  category: "profitability",
  triggerType: "schedule",
  riskLevel: "low",
  requiresApproval: false,
  isEnabled: true,

  evaluate: async (ctx) => {
    const { data: listings } = await ctx.supabase
      .from("listings")
      .select("sku, title, sales_30d, price")
      .eq("user_id", ctx.userId)
      .is("cost_profile_id", null);

    if (!listings) return null;

    const active = listings.filter((l) => (Number(l.sales_30d) || 0) > 0);
    if (active.length === 0) return null;

    const blindRevenue = active.reduce(
      (sum, l) => sum + (Number(l.price) || 0) * (Number(l.sales_30d) || 0),
      0
    );

    return {
      ruleId: "auto_detect_missing_costs",
      ruleName: "Missing Cost Profile Detector",
      shouldExecute: true,
      confidence: 100,
      riskLevel: "low",
      requiresApproval: false,
      description: `${active.length} actively selling SKU(s) have no cost profile. ₹${blindRevenue.toLocaleString()} in revenue with unknown profitability.`,
      estimatedImpact: `₹${blindRevenue.toLocaleString()} revenue without profit visibility`,
      affectedEntities: active.map((l) => l.sku),
      suggestedAction: "Configure cost profiles to enable accurate P&L tracking.",
      rollbackStrategy: "Delete generated alert log on rollback.",
      metadata: { listings: active, blindRevenue },
    };
  },

  execute: async (ctx, evaluation) => {
    // Idempotency: Check if an unresolved missing cost profile alert already exists
    const { data: activeAlerts } = await ctx.supabase
      .from("alert_logs")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("type", "missing_cost_profile")
      .eq("is_read", false)
      .limit(1);

    if (activeAlerts && activeAlerts.length > 0) {
      return {
        success: true,
        message: "No new missing cost alerts needed; active alert already exists.",
        changes: [],
        canRollback: false,
      };
    }

    const alert = {
      user_id: ctx.userId,
      type: "missing_cost_profile",
      title: `${evaluation.affectedEntities.length} SKUs Missing Cost Profiles`,
      message: evaluation.description,
      is_read: false,
    };

    const { data: inserted, error } = await ctx.supabase
      .from("alert_logs")
      .insert(alert)
      .select("id")
      .single();

    if (error) throw error;

    return {
      success: true,
      message: `Flagged ${evaluation.affectedEntities.length} SKU(s) with missing cost profiles.`,
      changes: ["Created missing cost profile alert"],
      canRollback: true,
      rollbackData: { alertId: inserted?.id },
    };
  },

  rollback: async (ctx, rollbackData) => {
    const alertId = rollbackData?.alertId;
    if (alertId) {
      await ctx.supabase
        .from("alert_logs")
        .delete()
        .eq("id", alertId);
    }
    return {
      success: true,
      message: "Removed missing cost profile alert.",
      changes: alertId ? [`Deleted alert: ${alertId}`] : [],
      canRollback: false,
    };
  },
};

// ─── Engine ──────────────────────────────────────────────────────────

/**
 * Registry of all built-in automation rules.
 */
export const AUTOMATION_RULES: AutomationRule[] = [
  RULE_PAUSE_BLEEDING_CAMPAIGNS,
  RULE_RESTOCK_ALERT,
  RULE_MISSING_COST_DETECTOR,
];

/**
 * Evaluate all enabled automation rules for a given user.
 * Returns evaluations for rules that triggered.
 */
export async function evaluateRules(
  ctx: AutomationContext
): Promise<AutomationEvaluation[]> {
  const evaluations: AutomationEvaluation[] = [];

  // Fetch user's automation preferences (which rules are enabled/disabled)
  const { data: userPrefs } = await ctx.supabase
    .from("automation_preferences")
    .select("rule_id, is_enabled")
    .eq("user_id", ctx.userId);

  const prefMap = new Map<string, boolean>();
  if (userPrefs) {
    for (const pref of userPrefs) {
      prefMap.set(pref.rule_id, pref.is_enabled);
    }
  }

  for (const rule of AUTOMATION_RULES) {
    // Check user preference override (falls back to rule default)
    const isEnabled = prefMap.has(rule.id) ? prefMap.get(rule.id)! : rule.isEnabled;
    if (!isEnabled) continue;

    try {
      const evaluation = await rule.evaluate(ctx);
      if (evaluation && evaluation.shouldExecute) {
        evaluations.push(evaluation);
      }
    } catch (err) {
      console.error(`[AutomationEngine] Rule "${rule.id}" evaluation failed:`, err);
    }
  }

  return evaluations;
}

/**
 * Execute a single automation rule with full audit logging.
 */
export async function executeRule(
  ctx: AutomationContext,
  evaluation: AutomationEvaluation
): Promise<AutomationResult> {
  const rule = AUTOMATION_RULES.find((r) => r.id === evaluation.ruleId);
  if (!rule) {
    return { success: false, message: `Rule "${evaluation.ruleId}" not found.`, changes: [], canRollback: false };
  }

  // Log the execution attempt
  const logEntry: AutomationLogEntry = {
    user_id: ctx.userId,
    rule_id: evaluation.ruleId,
    rule_name: evaluation.ruleName,
    category: rule.category,
    risk_level: evaluation.riskLevel,
    status: evaluation.requiresApproval ? "pending" : "executed",
    confidence: evaluation.confidence,
    description: evaluation.description,
    estimated_impact: evaluation.estimatedImpact,
    affected_entities: evaluation.affectedEntities,
    action_taken: evaluation.suggestedAction,
    result_message: null,
    rollback_data: null,
    executed_at: evaluation.requiresApproval ? null : new Date().toISOString(),
  };

  // If approval required, save as pending and return
  if (evaluation.requiresApproval) {
    await ctx.supabase.from("automation_logs").insert(logEntry);
    return {
      success: true,
      message: `Automation "${evaluation.ruleName}" requires approval. Saved as pending.`,
      changes: ["Created pending approval entry"],
      canRollback: false,
    };
  }

  // Execute the rule
  try {
    const result = await rule.execute(ctx, evaluation);

    logEntry.status = result.success ? "executed" : "failed";
    logEntry.result_message = result.message;
    logEntry.rollback_data = result.rollbackData || null;
    logEntry.executed_at = new Date().toISOString();

    await ctx.supabase.from("automation_logs").insert(logEntry);

    return result;
  } catch (err: any) {
    logEntry.status = "failed";
    logEntry.result_message = err.message;
    await ctx.supabase.from("automation_logs").insert(logEntry);

    return {
      success: false,
      message: `Automation "${evaluation.ruleName}" failed: ${err.message}`,
      changes: [],
      canRollback: false,
    };
  }
}

/**
 * Run the full automation cycle for a user:
 * evaluate → filter → execute (low-risk auto) / queue (high-risk pending)
 */
export async function runAutomationCycle(
  ctx: AutomationContext
): Promise<{ evaluated: number; executed: number; pending: number; results: AutomationResult[] }> {
  const evaluations = await evaluateRules(ctx);
  const results: AutomationResult[] = [];
  let executed = 0;
  let pending = 0;

  for (const evaluation of evaluations) {
    const result = await executeRule(ctx, evaluation);
    results.push(result);

    if (evaluation.requiresApproval) {
      pending++;
    } else if (result.success) {
      executed++;
    }
  }

  return {
    evaluated: evaluations.length,
    executed,
    pending,
    results,
  };
}

/**
 * Consumes an AI-generated ExplainableRecommendation and bridges its lifecycle
 * into the Automation Engine for actual execution or approval.
 */
export async function transitionRecommendationToAutomation(
  ctx: AutomationContext,
  recommendation: any // ExplainableRecommendation
): Promise<AutomationResult> {
  if (!recommendation.action) {
    return { success: false, message: "No action mapped.", changes: [], canRollback: false };
  }

  const { automationType, payload, requiresApproval, supportsRollback } = recommendation.action;
  
  // Strict Lifecycle State Validation
  const validTransitions: Record<string, string[]> = {
    "Draft": ["Validated", "Pending Approval", "Approved"],
    "Validated": ["Pending Approval", "Approved"],
    "Pending Approval": ["Approved", "Rejected"],
    "Approved": ["Executing"],
    "Executing": ["Completed", "Failed"],
    "Completed": ["Rolled Back", "Archived"],
    "Failed": ["Archived"],
    "Rolled Back": ["Archived"],
    "Archived": []
  };

  const currentState = recommendation.lifecycle || "Draft";
  const targetState = requiresApproval ? "Pending Approval" : "Approved";

  if (!validTransitions[currentState]?.includes(targetState) && currentState !== targetState) {
    throw new Error(`Invalid lifecycle transition from ${currentState} to ${targetState}`);
  }

  // Transition Lifecycle State
  if (currentState === "Draft" || currentState === "Validated") {
    recommendation.lifecycle = targetState;
  }

  // Construct fake evaluation to use existing execution pipeline
  const fakeEval: AutomationEvaluation = {
    ruleId: automationType,
    ruleName: `AI Action: ${automationType}`,
    shouldExecute: true,
    confidence: recommendation.confidence,
    riskLevel: recommendation.riskLevel,
    requiresApproval,
    description: recommendation.recommendation,
    estimatedImpact: recommendation.simulation?.expectedCase?.expectedProfitImpact?.toString() || "Unknown",
    affectedEntities: [JSON.stringify(payload)],
    suggestedAction: automationType,
    rollbackStrategy: supportsRollback ? "Supported" : "None",
    metadata: payload
  };

  if (recommendation.lifecycle === "Approved") {
    recommendation.lifecycle = "Executing";
    const res = await executeRule(ctx, fakeEval);
    recommendation.lifecycle = res.success ? "Completed" : "Failed";
    return res;
  }

  return { success: true, message: "Action queued for approval.", changes: [], canRollback: false };
}
