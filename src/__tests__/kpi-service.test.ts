/**
 * Unit Tests — KPIService
 *
 * Verifies every deterministic formula used to calculate business KPIs.
 * These tests ensure the AI never receives incorrect pre-computed metrics.
 * 100% coverage of all public methods.
 */

import { describe, it, expect } from "vitest";
import { KPIService } from "../lib/services/kpi-service";

// ─── ACOS ─────────────────────────────────────────────────────────────

describe("KPIService.calculateACOS", () => {
  it("calculates ACOS correctly", () => {
    // ₹1,000 spend / ₹5,000 sales = 20%
    expect(KPIService.calculateACOS(1000, 5000)).toBe(20);
  });

  it("returns null when ACOS is undefined because attributed sales are zero", () => {
    expect(KPIService.calculateACOS(500, 0)).toBeNull();
  });

  it("returns null when ACOS has no denominator", () => {
    expect(KPIService.calculateACOS(0, 0)).toBeNull();
  });

  it("handles 100% ACOS (spend equals sales)", () => {
    expect(KPIService.calculateACOS(1000, 1000)).toBe(100);
  });
});

// ─── ROAS ─────────────────────────────────────────────────────────────

describe("KPIService.calculateROAS", () => {
  it("calculates ROAS correctly", () => {
    // ₹5,000 sales / ₹1,000 spend = 5x
    expect(KPIService.calculateROAS(1000, 5000)).toBe(5);
  });

  it("returns null when ROAS has no spend denominator", () => {
    expect(KPIService.calculateROAS(0, 1000)).toBeNull();
  });

  it("returns null when ROAS has no spend denominator and no sales", () => {
    expect(KPIService.calculateROAS(0, 0)).toBeNull();
  });
});

// ─── TACOS ────────────────────────────────────────────────────────────

describe("KPIService.calculateTACOS", () => {
  it("calculates TACOS correctly", () => {
    // ₹500 spend / ₹10,000 total sales = 5%
    expect(KPIService.calculateTACOS(500, 10000)).toBe(5);
  });

  it("returns null when TACOS has no revenue denominator", () => {
    expect(KPIService.calculateTACOS(500, 0)).toBeNull();
  });

  it("returns null when TACOS has no revenue denominator and no spend", () => {
    expect(KPIService.calculateTACOS(0, 0)).toBeNull();
  });
});

// ─── Profit ───────────────────────────────────────────────────────────

describe("KPIService.calculateProfit", () => {
  it("calculates gross profit correctly", () => {
    // Revenue=10000, COGS=3000, Fees=1000, AdSpend=500, Other=200
    // Profit = 10000 - (3000+1000+500+200) = 5300
    expect(KPIService.calculateProfit(10000, 3000, 1000, 500, 200)).toBe(5300);
  });

  it("returns negative profit for unprofitable SKU", () => {
    // Revenue=1000, costs=1500
    expect(KPIService.calculateProfit(1000, 800, 400, 300, 0)).toBe(-500);
  });

  it("defaults otherCosts to 0 when not provided", () => {
    expect(KPIService.calculateProfit(1000, 200, 100, 50)).toBe(650);
  });

  it("returns 0 profit when revenue exactly covers costs", () => {
    expect(KPIService.calculateProfit(1000, 500, 300, 200, 0)).toBe(0);
  });
});

// ─── Margin ───────────────────────────────────────────────────────────

describe("KPIService.calculateMargin", () => {
  it("calculates margin as a percentage", () => {
    // 500 profit / 1000 revenue = 50%
    expect(KPIService.calculateMargin(500, 1000)).toBe(50);
  });

  it("returns 0 when revenue is 0 (avoid division by zero)", () => {
    expect(KPIService.calculateMargin(100, 0)).toBe(0);
  });

  it("returns negative margin for loss-making products", () => {
    expect(KPIService.calculateMargin(-200, 1000)).toBe(-20);
  });
});

// ─── Inventory Velocity ───────────────────────────────────────────────

describe("KPIService.calculateInventoryVelocity", () => {
  it("calculates daily velocity correctly", () => {
    // 300 units in 30 days = 10/day
    expect(KPIService.calculateInventoryVelocity(300, 30)).toBe(10);
  });

  it("returns 0 when days is 0", () => {
    expect(KPIService.calculateInventoryVelocity(100, 0)).toBe(0);
  });
});

// ─── Restock Days ─────────────────────────────────────────────────────

describe("KPIService.calculateRestockDays", () => {
  it("calculates days of supply correctly", () => {
    // 100 units / 10 per day = 10 days
    expect(KPIService.calculateRestockDays(100, 10)).toBe(10);
  });

  it("returns null when velocity is not measured", () => {
    expect(KPIService.calculateRestockDays(100, 0)).toBeNull();
  });
});

// ─── Conversion Rate ──────────────────────────────────────────────────

describe("KPIService.calculateConversionRate", () => {
  it("calculates CVR correctly", () => {
    // 50 orders / 1000 sessions = 5%
    expect(KPIService.calculateConversionRate(50, 1000)).toBe(5);
  });

  it("returns 0 when sessions is 0", () => {
    expect(KPIService.calculateConversionRate(50, 0)).toBe(0);
  });
});

// ─── Confidence Score ─────────────────────────────────────────────────

describe("KPIService.calculateConfidenceScore", () => {
  it("returns high confidence for fresh, rich data", () => {
    const score = KPIService.calculateConfidenceScore(100, 0, 1, 0.1);
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it("penalizes missing fields", () => {
    const baseline = KPIService.calculateConfidenceScore(50, 0, 1);
    const withMissing = KPIService.calculateConfidenceScore(50, 3, 1);
    expect(withMissing).toBeLessThan(baseline);
  });

  it("penalizes stale data (>30 days)", () => {
    const fresh = KPIService.calculateConfidenceScore(50, 0, 1);
    const stale = KPIService.calculateConfidenceScore(50, 0, 35);
    expect(stale).toBeLessThan(fresh);
  });

  it("clamps to 0 minimum", () => {
    // Worst possible inputs
    const score = KPIService.calculateConfidenceScore(0, 10, 60, 1.0);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("clamps to 100 maximum", () => {
    const score = KPIService.calculateConfidenceScore(999, 0, 0, 0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
