import { DailyBriefing, DailyBriefingSchema } from "./schemas";
import { BIRepository } from "@/lib/repositories/bi-repository";
import { BusinessHealthEngine } from "./business-health-engine";
import { getAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export class DailyBriefingGenerator {
  static async generate(userId: string, workspaceId: string): Promise<DailyBriefing> {
    const todayStart = startOfUtcDay(new Date());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const adminClient = getAdminClient();
    const [summary, health, goalResult] = await Promise.all([
      BIRepository.getBusinessSummary(workspaceId, yesterdayStart, todayStart),
      BusinessHealthEngine.calculateHealth(userId, workspaceId),
      adminClient.from("goals")
        .select("name, current_savings, target_amount")
        .eq("workspace_id", workspaceId)
        .eq("is_completed", false)
        .is("deleted_at", null)
        .order("priority", { ascending: false })
        .limit(1),
    ]);
    if (goalResult.error) throw goalResult.error;

    const fees = summary.orders.totalCommissionFees + summary.orders.totalFbaFees + summary.orders.totalShippingCost;
    const profit = summary.cogs.totalCogs !== null && summary.ads.dataAvailable
      ? summary.orders.totalRevenue - summary.cogs.totalCogs - fees - summary.ads.totalSpend
      : null;
    const activeGoal = goalResult.data?.[0];
    const goalProgress = activeGoal
      ? `${activeGoal.name}: ₹${Number(activeGoal.current_savings ?? 0).toLocaleString("en-IN")} of ₹${Number(activeGoal.target_amount ?? 0).toLocaleString("en-IN")}`
      : "No active goal is configured.";
    const inventoryAlerts = [
      ...(summary.inventory.outOfStockItems > 0 ? [`${summary.inventory.outOfStockItems} active listings are out of stock.`] : []),
      ...(summary.inventory.lowStockItems > 0 ? [`${summary.inventory.lowStockItems} active listings are low on stock.`] : []),
    ];
    const advertisingSummary = summary.ads.dataAvailable
      ? `Amazon Ads recorded ₹${summary.ads.totalSpend.toLocaleString("en-IN")} spend and ₹${summary.ads.totalSales.toLocaleString("en-IN")} attributed sales.`
      : "No daily Amazon Ads facts are available for this UTC day.";
    const todaysMission = summary.inventory.outOfStockItems > 0
      ? "Review out-of-stock listings and confirm replenishment priorities."
      : summary.inventory.lowStockItems > 0
        ? "Review low-stock listings before accepting avoidable stock-out risk."
        : profit === null
          ? "Complete missing COGS or Ads data before relying on yesterday's profit."
          : summary.ads.totalSpend > 0 && summary.ads.totalSales === 0
            ? "Review campaigns that spent yesterday without attributed sales; no changes will occur without approval."
            : "Review the verified daily metrics and choose the highest-impact next action.";
    const confidence = Math.min(100,
      (summary.orders.sourceUpdatedAt ? 25 : 0) +
      (summary.inventory.sourceUpdatedAt ? 20 : 0) +
      (summary.ads.dataAvailable ? 30 : 0) +
      (summary.cogs.totalCogs !== null ? 25 : 0),
    );

    const response = DailyBriefingSchema.parse({
      date: yesterdayStart.toISOString().slice(0, 10),
      greeting: "Verified daily operating brief. Missing inputs are shown as unavailable rather than estimated.",
      yesterdaySummary: {
        revenue: summary.orders.totalRevenue,
        profit,
        orders: summary.orders.totalOrders,
        topProduct: summary.orders.topProduct?.title ?? null,
      },
      advertisingSummary,
      inventoryAlerts,
      businessHealthScore: health.score,
      goalProgress,
      todaysMission,
      recommendedActions: [],
      confidence,
      dataWindow: { since: yesterdayStart.toISOString(), until: todayStart.toISOString(), timezone: "UTC" },
      dataSources: [
        summary.orders.dataSource,
        summary.inventory.dataSource,
        summary.cogs.dataSource,
        ...(summary.ads.dataAvailable ? [summary.ads.dataSource] : []),
      ],
    });
    log.info("[DailyBriefingGenerator] Deterministic briefing complete.", undefined, {
      userId,
      workspaceId,
      date: response.date,
      confidence: response.confidence,
    });
    return response;
  }
}
