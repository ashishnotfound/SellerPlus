import { describe, expect, it } from "vitest";
import { buildDeterministicOpportunities } from "@/lib/ai/opportunity-radar";
import { buildDeterministicRisks } from "@/lib/ai/risk-radar";
import type { BusinessSummary } from "@/lib/repositories/bi-repository";

function summary(overrides: Partial<BusinessSummary> = {}): BusinessSummary {
  return {
    dataWindow: { since: "2026-07-21T00:00:00.000Z", until: "2026-08-20T00:00:00.000Z" },
    ads: { totalSpend: 0, totalSales: 0, totalImpressions: 0, totalClicks: 0, campaignCount: 0, activeCampaignCount: 0, dataAvailable: false, earliestDate: null, latestDate: null, sourceUpdatedAt: null, dataSource: "amazon_ads_api_v3_daily" },
    orders: { totalRevenue: 100_000, totalOrders: 100, totalCommissionFees: 10_000, totalFbaFees: 5_000, totalShippingCost: 2_000, orderStatusCounts: {}, totalNetProfit: null, profitCoverage: 50, topProduct: null, sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_sp_api" },
    inventory: { totalItems: 20, lowStockItems: 2, outOfStockItems: 1, sourceUpdatedAt: "2026-08-20T00:00:00.000Z", dataSource: "amazon_sp_api_report" },
    cogs: { totalCogs: null, listingsWithCostProfile: 10, coveredUnits: 50, totalUnits: 100, coverage: 50, dataSource: "seller_entered_cost_profiles" },
    ...overrides,
  };
}

describe("evidence-bound radars", () => {
  it("derives risks from exact source-backed checks without invented impact", () => {
    const result = buildDeterministicRisks(summary());

    expect(result.methodology).toBe("deterministic_evidence_v1");
    expect(result.items.map((item) => item.id)).toEqual(expect.arrayContaining([
      "risk-complete-cogs-coverage",
      "risk-sync-amazon-ads-daily",
      "risk-review-out-of-stock-listings",
    ]));
    expect(result.items.every((item) => item.expectedImpactValue === undefined)).toBe(true);
    expect(result.items.every((item) => item.evidence.length > 0 && item.dataSources.length > 0)).toBe(true);
  });

  it("fails closed instead of inferring opportunities from aggregate totals", () => {
    const result = buildDeterministicOpportunities(summary());

    expect(result.kind).toBe("opportunity");
    expect(result.items).toEqual([]);
    expect(result.limitations).toContain("SellerPlus does not invent sales lift, demand, keyword volume, or expected financial impact.");
  });
});
