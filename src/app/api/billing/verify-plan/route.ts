/**
 * SellerPlus OS — Subscription Verification API
 * 
 * Server-side subscription plan verification endpoint.
 * Returns the authenticated user's active subscription plan from the database,
 * not from client-side state. This is the source of truth for plan gating.
 * 
 * GET /api/billing/verify-plan
 *   Returns: { plan, status, limits, usage }
 */

import { NextResponse } from "next/server";
import {
  authenticateWithDevFallback,
  authErrorResponse,
} from "@/lib/auth-middleware";

const PLAN_LIMITS: Record<string, { maxGenerations: number; maxAudits: number }> = {
  free:     { maxGenerations: 10,   maxAudits: 3 },
  weekly:   { maxGenerations: 50,   maxAudits: 15 },
  pro:      { maxGenerations: 200,  maxAudits: 50 },
  business: { maxGenerations: 9999, maxAudits: 9999 },
};

const GATED_FEATURES: Record<string, string[]> = {
  "full-listing-generator": ["pro", "business"],
  "competitor-analysis":    ["weekly", "pro", "business"],
  "csv-export":             ["weekly", "pro", "business"],
  "a-plus-content":         ["pro", "business"],
  "brand-story":            ["pro", "business"],
  "etsy-marketplace":       ["pro", "business"],
  "shopify-marketplace":    ["pro", "business"],
};

export async function GET(request: Request) {
  try {
    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request);

    // 1. Fetch active subscription from DB
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("plan_type, status, current_period_start, current_period_end, cancel_at_period_end")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const plan = subscription?.plan_type || "free";
    const status = subscription?.status || "active";
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // 2. Count current period AI usage (graceful fallback if table missing)
    const periodStart = subscription?.current_period_start
      ? new Date(subscription.current_period_start).toISOString()
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let generationsCount = 0;
    let auditsCount = 0;
    try {
      const { count: gc } = await supabaseAdmin
        .from("ai_generations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", periodStart);
      generationsCount = gc || 0;

      const { count: ac } = await supabaseAdmin
        .from("ai_generations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("generation_type", "judge")
        .gte("created_at", periodStart);
      auditsCount = ac || 0;
    } catch (_usageErr) {
      // ai_generations table may not exist yet — usage counts default to 0
    }

    // 3. Build feature access map
    const featureAccess: Record<string, boolean> = {};
    for (const [feature, allowedPlans] of Object.entries(GATED_FEATURES)) {
      featureAccess[feature] = allowedPlans.includes(plan);
    }

    return NextResponse.json({
      plan,
      status,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
      periodEnd: subscription?.current_period_end || null,
      limits: {
        maxGenerations: limits.maxGenerations,
        maxAudits: limits.maxAudits,
      },
      usage: {
        aiGenerations: generationsCount || 0,
        auditsUsed: auditsCount || 0,
      },
      featureAccess,
    });
  } catch (error) {
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
