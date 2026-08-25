import { describe, expect, it } from "vitest";
import {
  buildDeterministicRecommendations,
  buildVerifiedWidgets,
} from "@/lib/ai/bi-engine";
import type { BusinessSummary } from "@/lib/repositories/bi-repository";

function summary(overrides: Partial<BusinessSummary> = {}): BusinessSummary {
  return {
    dataWindow: { since: "2026-07-21T00:00:00.000Z", until: "2026-08-20T00:00:00.000Z" },
    ads: { totalSpend: 10_000, totalSales: 40_000, totalImpressions: 100_000, totalClicks: 1_000, campaignCount: 5, activeCampaignCount: 4, dataAvailable: true, earliestDate: "2026-07-21", latestDate: "2026-08-19", sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_ads_api_v3_daily" },
    orders: { totalRevenue: 100_000, totalOrders: 100, totalCommissionFees: 10_000, totalFbaFees: 5_000, totalShippingCost: 2_000, orderStatusCounts: {}, totalNetProfit: 43_000, profitCoverage: 100, topProduct: null, sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_sp_api" },
    inventory: { totalItems: 20, lowStockItems: 0, outOfStockItems: 0, sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_sp_api_report" },
    cogs: { totalCogs: 30_000, listingsWithCostProfile: 20, coveredUnits: 100, totalUnits: 100, coverage: 100, dataSource: "seller_entered_cost_profiles" },
    ...overrides,
  };
}

describe("deterministic BI dashboard", () => {
  it("emits only exact typed KPI datasets", () => {
    const widgets = buildVerifiedWidgets(summary(), 43_000);
    expect(widgets.every((widget) => widget.type === "KPI")).toBe(true);
    const revenue = widgets.find((widget) => widget.id === "verified-revenue");
    const profit = widgets.find((widget) => widget.id === "verified-contribution-profit");
    if (revenue?.type !== "KPI" || profit?.type !== "KPI") throw new Error("Expected KPI widgets");
    expect(revenue.dataset.value).toBe(100_000);
    expect(profit.dataset.value).toBe(43_000);
  });

  it("marks contribution profit unavailable when required inputs are incomplete", () => {
    const widgets = buildVerifiedWidgets(summary(), null);
    const profit = widgets.find((widget) => widget.id === "verified-contribution-profit");
    expect(profit?.type).toBe("KPI");
    if (profit?.type !== "KPI") throw new Error("Expected KPI widget");
    expect(profit.dataset.available).toBe(false);
    expect(profit.dataset.value).toBeNull();
  });

  it("creates review-only recommendations without model actions or impact claims", () => {
    const incomplete = summary({
      ads: { ...summary().ads, dataAvailable: false, totalSpend: 0, totalSales: 0 },
      cogs: { ...summary().cogs, totalCogs: null, coverage: 50, coveredUnits: 50 },
    });
    const recommendations = buildDeterministicRecommendations(incomplete, null);
    expect(recommendations.map((item) => item.id)).toEqual(expect.arrayContaining([
      "complete-cogs-coverage",
      "sync-amazon-ads-daily",
    ]));
    expect(recommendations.every((item) => item.action === undefined && item.simulation === undefined)).toBe(true);
  });
});
