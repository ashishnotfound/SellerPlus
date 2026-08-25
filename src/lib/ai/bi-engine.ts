import {
  BIResponseSchema,
  type BIResponse,
  type ExplainableRecommendation,
  type Widget,
} from "./schemas";
import { BIRepository, type BusinessSummary } from "@/lib/repositories/bi-repository";
import { KPIService } from "@/lib/services/kpi-service";
import { log } from "@/lib/logger";

export type AnalysisMode = "Store Audit" | "Advertising Audit" | "Inventory Audit" | "Executive Summary";

function currency(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function sourceAgeDays(summary: BusinessSummary): number {
  const timestamps = [summary.orders.sourceUpdatedAt, summary.inventory.sourceUpdatedAt, summary.ads.sourceUpdatedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (timestamps.length === 0) return 366;
  return Math.max(0, (Date.now() - Math.min(...timestamps)) / 86_400_000);
}

function recommendation(
  id: string,
  recommendationText: string,
  priority: ExplainableRecommendation["priority"],
  riskLevel: ExplainableRecommendation["riskLevel"],
  evidence: string[],
  sources: string[],
  sourceKPIs: string[],
  confidence: number,
  reasoning: string,
): ExplainableRecommendation {
  return {
    id,
    recommendation: recommendationText,
    priority,
    confidence,
    confidenceReason: "Deterministic confidence based on source freshness, observed record count, and missing required data areas.",
    evidence,
    sourceTables: sources,
    sourceKPIs,
    aiReasoning: reasoning,
    dependencies: [],
    conflicts: [],
    riskLevel,
    estimatedTime: "Requires seller review",
    lifecycle: "Validated",
  };
}

export function buildVerifiedWidgets(summary: BusinessSummary, contributionProfit: number | null): Widget[] {
  const contributionAvailable = contributionProfit !== null;
  return [
    {
      id: "verified-revenue",
      type: "KPI",
      title: "Revenue",
      description: "Eligible Amazon order revenue in the current 30-day aggregation window.",
      importance: "High",
      dataset: {
        value: summary.orders.totalRevenue,
        format: "currency",
        available: summary.orders.totalOrders > 0,
        source: summary.orders.dataSource,
        asOf: summary.orders.sourceUpdatedAt,
      },
    },
    {
      id: "verified-contribution-profit",
      type: "KPI",
      title: "Contribution Profit",
      description: contributionAvailable
        ? "Revenue minus covered COGS, Amazon fees and shipping, and Amazon Ads spend. Custom operating expenses are not included."
        : "Unavailable until COGS coverage is complete and Amazon Ads daily facts are present.",
      importance: "High",
      dataset: {
        value: contributionProfit,
        format: "currency",
        available: contributionAvailable,
        source: contributionAvailable
          ? `${summary.orders.dataSource} + ${summary.cogs.dataSource} + ${summary.ads.dataSource}`
          : "required sources incomplete",
        asOf: contributionAvailable ? summary.orders.sourceUpdatedAt : null,
      },
    },
    {
      id: "verified-orders",
      type: "KPI",
      title: "Orders",
      description: "Eligible Amazon orders in the current 30-day aggregation window.",
      importance: "Medium",
      dataset: {
        value: summary.orders.totalOrders,
        format: "number",
        available: true,
        source: summary.orders.dataSource,
        asOf: summary.orders.sourceUpdatedAt,
      },
    },
    {
      id: "verified-ad-spend",
      type: "KPI",
      title: "Amazon Ads Spend",
      description: summary.ads.dataAvailable
        ? "Spend from Amazon Ads API v3 daily campaign reports."
        : "No Amazon Ads daily facts are available for this window.",
      importance: "Medium",
      dataset: {
        value: summary.ads.dataAvailable ? summary.ads.totalSpend : null,
        format: "currency",
        available: summary.ads.dataAvailable,
        source: summary.ads.dataSource,
        asOf: summary.ads.sourceUpdatedAt,
      },
    },
    {
      id: "verified-out-of-stock",
      type: "KPI",
      title: "Out of Stock",
      description: "Active listings with zero available quantity in the latest inventory source.",
      importance: summary.inventory.outOfStockItems > 0 ? "High" : "Low",
      dataset: {
        value: summary.inventory.outOfStockItems,
        format: "number",
        available: summary.inventory.sourceUpdatedAt !== null,
        source: summary.inventory.dataSource,
        asOf: summary.inventory.sourceUpdatedAt,
      },
    },
  ];
}

export function buildDeterministicRecommendations(
  summary: BusinessSummary,
  contributionProfit: number | null,
): ExplainableRecommendation[] {
  const missingAreas = [
    summary.orders.totalOrders === 0,
    !summary.ads.dataAvailable,
    summary.inventory.sourceUpdatedAt === null,
    summary.cogs.totalCogs === null,
  ].filter(Boolean).length;
  const dataPoints = summary.orders.totalOrders + summary.ads.campaignCount + summary.inventory.totalItems;
  const confidence = KPIService.calculateConfidenceScore(dataPoints, missingAreas, sourceAgeDays(summary));
  const items: ExplainableRecommendation[] = [];

  if (summary.orders.totalOrders > 0 && summary.cogs.totalCogs === null) {
    items.push(recommendation(
      "complete-cogs-coverage",
      "Complete COGS coverage before making profit-based decisions.",
      "Critical",
      "Low",
      [
        `COGS coverage is ${summary.cogs.coverage.toFixed(1)}%.`,
        `${summary.cogs.coveredUnits.toLocaleString()} of ${summary.cogs.totalUnits.toLocaleString()} ordered units have seller-entered cost coverage.`,
      ],
      [summary.cogs.dataSource, summary.orders.dataSource],
      ["COGS coverage", "covered units"],
      confidence,
      "Missing unit costs make contribution-profit and margin calculations incomplete; SellerPlus will not substitute zero.",
    ));
  }

  if (summary.orders.totalOrders > 0 && !summary.ads.dataAvailable) {
    items.push(recommendation(
      "sync-amazon-ads-daily",
      "Restore or run the Amazon Ads daily performance sync.",
      "High",
      "Low",
      ["No Amazon Ads API v3 daily facts are available in the current aggregation window."],
      [summary.ads.dataSource],
      ["Ads data availability"],
      confidence,
      "Profit and TACOS cannot be relied on without verified advertising spend for the same period.",
    ));
  }

  if (summary.inventory.outOfStockItems > 0) {
    items.push(recommendation(
      "review-out-of-stock-listings",
      "Review out-of-stock active listings and confirm replenishment priorities.",
      "Critical",
      "Medium",
      [`${summary.inventory.outOfStockItems} active listings have zero available quantity.`],
      [summary.inventory.dataSource],
      ["out-of-stock active listings"],
      confidence,
      "The inventory source shows unavailable stock; SellerPlus is not inferring demand or a reorder quantity without sales history and lead-time inputs.",
    ));
  } else if (summary.inventory.lowStockItems > 0) {
    items.push(recommendation(
      "review-low-stock-listings",
      "Review low-stock active listings before avoidable stock-outs occur.",
      "High",
      "Low",
      [`${summary.inventory.lowStockItems} active listings have between 1 and 19 available units.`],
      [summary.inventory.dataSource],
      ["low-stock active listings"],
      confidence,
      "This is a threshold alert only; reorder quantities require verified velocity, inbound stock, and supplier lead time.",
    ));
  }

  if (summary.ads.dataAvailable && summary.ads.totalSpend > 0 && summary.ads.totalSales === 0) {
    items.push(recommendation(
      "review-spend-without-attributed-sales",
      "Review campaigns that spent without attributed sales; make no bid changes until campaign-level evidence is checked.",
      "High",
      "Medium",
      [`Amazon Ads recorded ${currency(summary.ads.totalSpend)} spend and ${currency(summary.ads.totalSales)} attributed sales in the window.`],
      [summary.ads.dataSource],
      ["ad spend", "attributed ad sales"],
      confidence,
      "Aggregate spend warrants investigation, but this summary is not granular enough to identify a safe campaign mutation.",
    ));
  }

  if (contributionProfit !== null && contributionProfit < 0) {
    items.push(recommendation(
      "investigate-negative-contribution",
      "Investigate the verified negative contribution result before scaling spend or inventory.",
      "Critical",
      "Medium",
      [`Calculated 30-day contribution profit is ${currency(contributionProfit)}.`],
      [summary.orders.dataSource, summary.cogs.dataSource, summary.ads.dataSource],
      ["contribution profit"],
      confidence,
      "The covered revenue, COGS, Amazon fees and shipping, and Ads spend produce a negative contribution result. Custom expenses may reduce profit further.",
    ));
  }

  return items;
}

export class BIEngine {
  static async runAnalysis(
    userId: string,
    workspaceId: string,
    mode: AnalysisMode,
    goal = "MAXIMIZE_PROFIT",
    _customPrompt?: string,
  ): Promise<BIResponse> {
    const summary = await BIRepository.getBusinessSummary(workspaceId);
    const hasData = summary.orders.totalOrders > 0 || summary.inventory.totalItems > 0 || summary.ads.dataAvailable;
    if (!hasData) {
      return BIResponseSchema.parse({ analysisMode: mode, summary: "", widgets: [], recommendations: [] });
    }

    const fees = summary.orders.totalCommissionFees + summary.orders.totalFbaFees + summary.orders.totalShippingCost;
    const contributionProfit = summary.cogs.totalCogs !== null && summary.ads.dataAvailable
      ? KPIService.calculateProfit(summary.orders.totalRevenue, summary.cogs.totalCogs, fees, summary.ads.totalSpend)
      : null;
    const availability = contributionProfit === null
      ? `Contribution profit is unavailable: COGS coverage is ${summary.cogs.coverage.toFixed(1)}% and Ads daily data is ${summary.ads.dataAvailable ? "available" : "unavailable"}.`
      : `Verified contribution profit is ${currency(contributionProfit)} before custom operating expenses.`;

    const response = BIResponseSchema.parse({
      analysisMode: mode,
      summary: `Verified 30-day operating snapshot: ${currency(summary.orders.totalRevenue)} revenue from ${summary.orders.totalOrders.toLocaleString()} eligible orders. ${availability}`,
      widgets: buildVerifiedWidgets(summary, contributionProfit),
      recommendations: buildDeterministicRecommendations(summary, contributionProfit),
    });

    log.info("[BIEngine] Deterministic analysis complete.", undefined, {
      userId,
      workspaceId,
      goal,
      mode,
      recommendationCount: response.recommendations.length,
    });
    return response;
  }
}
