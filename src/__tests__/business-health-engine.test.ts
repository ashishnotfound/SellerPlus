import { describe, expect, it } from "vitest";
import { calculateDeterministicBusinessHealth } from "@/lib/ai/business-health-engine";
import type { BusinessSummary } from "@/lib/repositories/bi-repository";

function summary(overrides: Partial<BusinessSummary> = {}): BusinessSummary {
  return {
    dataWindow: { since: "2026-07-21T00:00:00.000Z", until: "2026-08-20T00:00:00.000Z" },
    ads: { totalSpend: 10_000, totalSales: 50_000, totalImpressions: 100_000, totalClicks: 2_000, campaignCount: 10, activeCampaignCount: 8, dataAvailable: true, earliestDate: "2026-07-21", latestDate: "2026-08-19", sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_ads_api_v3_daily" },
    orders: { totalRevenue: 100_000, totalOrders: 500, totalCommissionFees: 10_000, totalFbaFees: 5_000, totalShippingCost: 2_000, orderStatusCounts: {}, totalNetProfit: 43_000, profitCoverage: 100, topProduct: null, sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_sp_api" },
    inventory: { totalItems: 100, lowStockItems: 5, outOfStockItems: 2, sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_sp_api_report" },
    cogs: { totalCogs: 30_000, listingsWithCostProfile: 20, coveredUnits: 500, totalUnits: 500, coverage: 100, dataSource: "seller_entered_cost_profiles" },
    ...overrides,
  };
}

describe("deterministic business health", () => {
  it("derives a score from traceable components and leaves Ads unscored without a target", () => {
    const result = calculateDeterministicBusinessHealth(summary(), summary({
      orders: { ...summary().orders, totalRevenue: 90_000 },
    }), []);

    expect(result.available).toBe(true);
    expect(result.components.revenue).toBeGreaterThan(50);
    expect(result.components.profitability).not.toBeNull();
    expect(result.components.advertising).toBeNull();
    expect(result.methodology).toBe("deterministic_health_v1");
  });

  it("does not manufacture profitability when COGS coverage is incomplete", () => {
    const current = summary({ cogs: { ...summary().cogs, totalCogs: null, coverage: 60 } });
    const result = calculateDeterministicBusinessHealth(current, summary(), []);
    expect(result.components.profitability).toBeNull();
    expect(result.limitations.join(" ")).toMatch(/COGS coverage/i);
  });

  it("returns an unavailable overall score when fewer than two components can be scored", () => {
    const empty = summary({
      ads: { ...summary().ads, dataAvailable: false, totalSpend: 0, totalSales: 0 },
      orders: { ...summary().orders, totalRevenue: 0, totalOrders: 0 },
      inventory: { ...summary().inventory, totalItems: 0, lowStockItems: 0, outOfStockItems: 0 },
      cogs: { ...summary().cogs, totalCogs: null, totalUnits: 0, coveredUnits: 0, coverage: 0 },
    });
    const result = calculateDeterministicBusinessHealth(empty, empty, []);
    expect(result.available).toBe(false);
    expect(result.score).toBeNull();
  });
});
