import { BusinessHealthResponse, BusinessHealthResponseSchema } from "./schemas";
import { BIRepository, type BusinessSummary } from "@/lib/repositories/bi-repository";
import { getAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

interface GoalProgress {
  current_savings: number | string | null;
  target_amount: number | string | null;
}

const DAY_MS = 86_400_000;
const clamp = (value: number) => Math.min(100, Math.max(0, value));
const rounded = (value: number) => Math.round(value * 10) / 10;

function contributionProfit(summary: BusinessSummary): { profit: number; margin: number } | null {
  if (summary.cogs.totalCogs === null || !summary.ads.dataAvailable || summary.orders.totalRevenue <= 0) return null;
  const fees = summary.orders.totalCommissionFees + summary.orders.totalFbaFees + summary.orders.totalShippingCost;
  const profit = summary.orders.totalRevenue - summary.cogs.totalCogs - fees - summary.ads.totalSpend;
  return { profit, margin: (profit / summary.orders.totalRevenue) * 100 };
}

export function calculateDeterministicBusinessHealth(
  current: BusinessSummary,
  previous: BusinessSummary,
  goals: GoalProgress[],
): BusinessHealthResponse {
  const limitations: string[] = [];
  const revenueGrowth = previous.orders.totalRevenue > 0 && current.orders.totalRevenue > 0
    ? ((current.orders.totalRevenue - previous.orders.totalRevenue) / previous.orders.totalRevenue) * 100
    : null;
  const revenue = revenueGrowth === null ? null : rounded(clamp(50 + revenueGrowth));
  if (revenue === null) limitations.push("Revenue health needs non-zero order revenue in both the current and previous 30-day windows.");

  const profitMetric = contributionProfit(current);
  const profitability = profitMetric ? rounded(clamp(50 + profitMetric.margin * 2.5)) : null;
  if (profitability === null) limitations.push("Profitability is unscored until COGS coverage is complete and daily Amazon Ads facts are available.");

  // A universal ACOS threshold would be unsafe. SellerPlus reports Ads facts,
  // but needs a tenant target/break-even policy before assigning a score.
  const advertising = null;
  limitations.push("Advertising is reported but not scored without a configured target or break-even ACOS policy.");

  const inventory = current.inventory.totalItems > 0
    ? rounded(clamp(100 - ((current.inventory.outOfStockItems + current.inventory.lowStockItems * 0.5) / current.inventory.totalItems) * 100))
    : null;
  if (inventory === null) limitations.push("Inventory health needs at least one active listing from a fresh inventory source.");

  const goalRatios = goals.flatMap((goal) => {
    const target = Number(goal.target_amount);
    const currentValue = Number(goal.current_savings);
    return Number.isFinite(target) && target > 0 && Number.isFinite(currentValue)
      ? [clamp((currentValue / target) * 100)]
      : [];
  });
  const goalScore = goalRatios.length > 0
    ? rounded(goalRatios.reduce((sum, value) => sum + value, 0) / goalRatios.length)
    : null;
  if (goalScore === null) limitations.push("Goal health needs at least one active goal with a positive target.");

  const components = { revenue, profitability, advertising, inventory, goals: goalScore };
  const weights = { revenue: 0.25, profitability: 0.4, advertising: 0.2, inventory: 0.1, goals: 0.05 } as const;
  const availableComponents = Object.entries(components)
    .filter((entry): entry is [keyof typeof components, number] => entry[1] !== null);
  const availableWeight = availableComponents.reduce((sum, [key]) => sum + weights[key], 0);
  const score = availableComponents.length >= 2 && availableWeight > 0
    ? rounded(availableComponents.reduce((sum, [key, value]) => sum + value * weights[key], 0) / availableWeight)
    : null;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (revenueGrowth !== null) {
    const message = `Revenue changed ${rounded(revenueGrowth)}% versus the previous 30-day window.`;
    (revenueGrowth >= 0 ? strengths : weaknesses).push(message);
  }
  if (profitMetric) {
    const message = `Calculated contribution margin is ${rounded(profitMetric.margin)}% after recorded COGS, fees, shipping, and Ads spend.`;
    (profitMetric.margin >= 0 ? strengths : weaknesses).push(message);
  }
  if (current.inventory.outOfStockItems > 0) weaknesses.push(`${current.inventory.outOfStockItems} active listings are out of stock.`);
  if (current.inventory.lowStockItems > 0) weaknesses.push(`${current.inventory.lowStockItems} active listings are low on stock.`);
  if (current.inventory.totalItems > 0 && current.inventory.outOfStockItems === 0) strengths.push("No active listings are currently marked out of stock.");
  if (!current.ads.dataAvailable) weaknesses.push("No daily Amazon Ads facts are available for the current window.");

  const trend = revenueGrowth === null
    ? "Unavailable"
    : revenueGrowth > 5 ? "Improving" : revenueGrowth < -5 ? "Declining" : "Stable";

  return BusinessHealthResponseSchema.parse({
    available: score !== null,
    score,
    trend,
    components,
    dataCompleteness: availableComponents.length * 20,
    methodology: "deterministic_health_v1",
    dataWindow: current.dataWindow,
    dataSources: [
      current.orders.dataSource,
      current.inventory.dataSource,
      current.cogs.dataSource,
      ...(current.ads.dataAvailable ? [current.ads.dataSource] : []),
    ],
    strengths,
    weaknesses,
    limitations,
    recommendations: [],
  });
}

export class BusinessHealthEngine {
  static async calculateHealth(userId: string, workspaceId: string): Promise<BusinessHealthResponse> {
    const until = new Date();
    const currentStart = new Date(until.getTime() - 30 * DAY_MS);
    const previousStart = new Date(currentStart.getTime() - 30 * DAY_MS);
    const adminClient = getAdminClient();
    const [current, previous, goalResult] = await Promise.all([
      BIRepository.getBusinessSummary(workspaceId, currentStart, until),
      BIRepository.getBusinessSummary(workspaceId, previousStart, currentStart),
      adminClient.from("goals")
        .select("current_savings, target_amount")
        .eq("workspace_id", workspaceId)
        .eq("is_completed", false)
        .is("deleted_at", null)
        .limit(100),
    ]);
    if (goalResult.error) throw goalResult.error;
    const response = calculateDeterministicBusinessHealth(current, previous, goalResult.data ?? []);
    log.info("[BusinessHealthEngine] Deterministic health calculation complete.", undefined, {
      userId,
      workspaceId,
      available: response.available,
      score: response.score,
      dataCompleteness: response.dataCompleteness,
    });
    return response;
  }
}
