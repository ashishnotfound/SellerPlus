import { describe, expect, it } from "vitest";
import {
  summarizeFinancialLogs,
  type FinancialLogEntry,
} from "@/hooks/use-analytics-store";

function financialDay(overrides: Partial<FinancialLogEntry> = {}): FinancialLogEntry {
  return {
    date: "2026-08-20",
    revenue: 1_000,
    ordersCount: 4,
    unitsSold: 5,
    cogs: 300,
    cogsCoverage: 100,
    shippingCost: 50,
    amazonFees: 150,
    adSpend: 100,
    adSales: 400,
    refundCosts: 0,
    refundCount: 0,
    contributionProfit: null,
    calculationStatus: "incomplete",
    sourceUpdatedAt: "2026-08-20T12:00:00Z",
    limitations: [],
    ...overrides,
  };
}

describe("financial summaries", () => {
  it("keeps profit unavailable when a required source is missing", () => {
    const summary = summarizeFinancialLogs([financialDay({ amazonFees: null })]);

    expect(summary.revenue).toBe(1_000);
    expect(summary.amazonFees).toBeNull();
    expect(summary.grossProfit).toBeNull();
    expect(summary.netProfit).toBeNull();
    expect(summary.margin).toBeNull();
  });

  it("preserves source-qualified zeroes instead of treating them as missing", () => {
    const summary = summarizeFinancialLogs([
      financialDay({ shippingCost: 0, amazonFees: 0, adSpend: 0, refundCosts: 0 }),
    ]);

    expect(summary.shippingCost).toBe(0);
    expect(summary.amazonFees).toBe(0);
    expect(summary.adSpend).toBe(0);
    expect(summary.netProfit).toBe(700);
  });

  it("fails the whole period closed when any day lacks coverage", () => {
    const summary = summarizeFinancialLogs([
      financialDay(),
      financialDay({ date: "2026-08-19", cogs: null, cogsCoverage: 0 }),
    ]);

    expect(summary.revenue).toBe(2_000);
    expect(summary.cogs).toBeNull();
    expect(summary.netProfit).toBeNull();
  });
});
