import { describe, expect, it } from "vitest";
import { modelBusinessScenario } from "@/lib/ai/business-simulator";
import type { BusinessSummary } from "@/lib/repositories/bi-repository";

const summary: BusinessSummary = {
  dataWindow: { since: "2026-07-21T00:00:00.000Z", until: "2026-08-20T00:00:00.000Z" },
  ads: { totalSpend: 10_000, totalSales: 50_000, totalImpressions: 100_000, totalClicks: 2_000, campaignCount: 10, activeCampaignCount: 8, dataAvailable: true, earliestDate: "2026-07-21", latestDate: "2026-08-19", sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_ads_api_v3_daily" },
  orders: { totalRevenue: 100_000, totalOrders: 500, totalCommissionFees: 10_000, totalFbaFees: 5_000, totalShippingCost: 2_000, orderStatusCounts: {}, totalNetProfit: 43_000, profitCoverage: 100, topProduct: null, sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_sp_api" },
  inventory: { totalItems: 100, lowStockItems: 5, outOfStockItems: 2, sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_sp_api_report" },
  cogs: { totalCogs: 30_000, listingsWithCostProfile: 20, coveredUnits: 500, totalUnits: 500, coverage: 100, dataSource: "seller_entered_cost_profiles" },
};
const end = new Date("2026-08-20T00:00:00.000Z");
const start = new Date("2026-07-21T00:00:00.000Z");

describe("modelBusinessScenario", () => {
  it("calculates an explicit ad-spend change but keeps profit unavailable", () => {
    const result = modelBusinessScenario("Cut ad spend by 20%", summary, start, end);

    expect(result.supported).toBe(true);
    expect(result.advertisingImpact).toMatchObject({ minimum: -2_000, maximum: -2_000, source: "calculated" });
    expect(result.revenueImpact).toMatchObject({ minimum: -15_000, maximum: -5_000, source: "modelled_estimate" });
    expect(result.profitImpact).toMatchObject({ minimum: null, maximum: null, source: "unavailable" });
    expect(result.confidence).toBeLessThanOrEqual(35);
  });

  it("calculates a cost-only contribution change with stated assumptions", () => {
    const result = modelBusinessScenario("Reduce COGS by 10 percent", summary, start, end);

    expect(result.profitImpact).toMatchObject({ minimum: 3_000, maximum: 3_000, source: "calculated" });
    expect(result.revenueImpact).toMatchObject({ minimum: 0, maximum: 0 });
    expect(result.assumptions.join(" ")).toContain("held constant");
  });

  it("refuses unsupported scenarios instead of inventing numbers", () => {
    const result = modelBusinessScenario("Launch a premium poster collection", summary, start, end);

    expect(result.supported).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.revenueImpact.minimum).toBeNull();
    expect(result.profitImpact.maximum).toBeNull();
  });
});
