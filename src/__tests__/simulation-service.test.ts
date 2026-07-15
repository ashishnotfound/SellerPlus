/**
 * Unit Tests — SimulationService
 *
 * Verifies the deterministic bounding logic used to calculate projected
 * business impact of AI recommendations. The AI receives these numbers —
 * correctness is critical to avoid hallucinated financial projections.
 */

import { describe, it, expect } from "vitest";
import { SimulationService } from "../lib/services/simulation-service";

// ─── Pause Campaign ───────────────────────────────────────────────────

describe("SimulationService.simulatePauseCampaign", () => {
  it("returns three scenario objects (bestCase, expectedCase, worstCase)", () => {
    const result = SimulationService.simulatePauseCampaign(1000, 500, 0.2);
    expect(result).toHaveProperty("bestCase");
    expect(result).toHaveProperty("expectedCase");
    expect(result).toHaveProperty("worstCase");
    expect(result).toHaveProperty("deterministicFormulaUsed");
  });

  it("bestCase recovers full spend as profit (100% organic assumption)", () => {
    const result = SimulationService.simulatePauseCampaign(1000, 500, 0.2);
    expect(result.bestCase.expectedProfitImpact).toBe(1000); // Full spend recovered
    expect(result.bestCase.expectedAdvertisingImpact).toBe(-1000); // Ad spend eliminated
  });

  it("expectedCase loses 50% of ad sales", () => {
    const result = SimulationService.simulatePauseCampaign(1000, 500, 0.2);
    expect(result.expectedCase.expectedRevenueImpact).toBe(-(500 * 0.5)); // -250
  });

  it("worstCase loses 100% of ad sales", () => {
    const result = SimulationService.simulatePauseCampaign(1000, 500, 0.2);
    expect(result.worstCase.expectedRevenueImpact).toBe(-500);
  });

  it("advertising impact is always the negative of spend", () => {
    const spend = 2500;
    const result = SimulationService.simulatePauseCampaign(spend, 1000, 0.2);
    expect(result.bestCase.expectedAdvertisingImpact).toBe(-spend);
    expect(result.expectedCase.expectedAdvertisingImpact).toBe(-spend);
    expect(result.worstCase.expectedAdvertisingImpact).toBe(-spend);
  });

  it("handles zero spend gracefully", () => {
    const result = SimulationService.simulatePauseCampaign(0, 0, 0.2);
    expect(result.bestCase.expectedProfitImpact).toBeCloseTo(0);
    expect(result.worstCase.expectedRevenueImpact).toBeCloseTo(0);
  });

  it("uses default margin of 0.2 when not specified", () => {
    const withDefault = SimulationService.simulatePauseCampaign(1000, 500);
    const withExplicit = SimulationService.simulatePauseCampaign(1000, 500, 0.2);
    expect(withDefault.expectedCase.expectedProfitImpact).toBe(
      withExplicit.expectedCase.expectedProfitImpact
    );
  });

  it("includes assumptions in each scenario", () => {
    const result = SimulationService.simulatePauseCampaign(1000, 500, 0.2);
    expect(result.bestCase.assumptions.length).toBeGreaterThan(0);
    expect(result.expectedCase.assumptions.length).toBeGreaterThan(0);
    expect(result.worstCase.assumptions.length).toBeGreaterThan(0);
  });
});

// ─── Price Increase ───────────────────────────────────────────────────

describe("SimulationService.simulatePriceIncrease", () => {
  it("returns all three scenarios and formula", () => {
    const result = SimulationService.simulatePriceIncrease(100, 50, 0.1);
    expect(result).toHaveProperty("bestCase");
    expect(result).toHaveProperty("expectedCase");
    expect(result).toHaveProperty("worstCase");
    expect(result.deterministicFormulaUsed).toContain("NewPrice");
  });

  it("bestCase assumes zero demand drop (full price uplift)", () => {
    const result = SimulationService.simulatePriceIncrease(100, 50, 0.1);
    // New price = 110, price diff = 10, volume = 50 → profit = 10 * 50 = 500
    expect(result.bestCase.expectedProfitImpact).toBeCloseTo(500, 1);
  });

  it("expectedCase applies 10% volume drop", () => {
    const result = SimulationService.simulatePriceIncrease(100, 50, 0.1);
    // Expected: (110 * 45) - (100 * 50) = 4950 - 5000 = -50 revenue impact
    expect(result.expectedCase.expectedRevenueImpact).toBeCloseTo(-50, 1);
  });

  it("worstCase applies 40% volume drop", () => {
    const result = SimulationService.simulatePriceIncrease(100, 50, 0.1);
    // Worst: (110 * 30) - (100 * 50) = 3300 - 5000 = -1700 revenue impact
    expect(result.worstCase.expectedRevenueImpact).toBeCloseTo(-1700, 0);
  });

  it("advertising impact is always 0 for price increases", () => {
    const result = SimulationService.simulatePriceIncrease(100, 50, 0.1);
    expect(result.bestCase.expectedAdvertisingImpact).toBe(0);
    expect(result.expectedCase.expectedAdvertisingImpact).toBe(0);
    expect(result.worstCase.expectedAdvertisingImpact).toBe(0);
  });

  it("uses default increasePercent=0.1 when not specified", () => {
    const withDefault = SimulationService.simulatePriceIncrease(100, 50);
    const withExplicit = SimulationService.simulatePriceIncrease(100, 50, 0.1);
    expect(withDefault.bestCase.expectedProfitImpact).toBe(
      withExplicit.bestCase.expectedProfitImpact
    );
  });
});

// ─── Restock ──────────────────────────────────────────────────────────

describe("SimulationService.simulateRestock", () => {
  it("returns all three scenarios", () => {
    const result = SimulationService.simulateRestock(10, 14, 500, 100);
    expect(result).toHaveProperty("bestCase");
    expect(result).toHaveProperty("expectedCase");
    expect(result).toHaveProperty("worstCase");
  });

  it("expectedCase matches velocity * days * unit metrics exactly", () => {
    const dailyVelocity = 10;
    const days = 14;
    const price = 500;
    const margin = 100;
    const result = SimulationService.simulateRestock(dailyVelocity, days, price, margin);

    expect(result.expectedCase.expectedRevenueImpact).toBe(dailyVelocity * days * price);
    expect(result.expectedCase.expectedProfitImpact).toBe(dailyVelocity * days * margin);
  });

  it("bestCase is 20% higher than expected (rank recovery uplift)", () => {
    const result = SimulationService.simulateRestock(10, 14, 500, 100);
    expect(result.bestCase.expectedRevenueImpact).toBe(
      result.expectedCase.expectedRevenueImpact * 1.2
    );
  });

  it("worstCase is 50% of expected (demand drop assumption)", () => {
    const result = SimulationService.simulateRestock(10, 14, 500, 100);
    expect(result.worstCase.expectedRevenueImpact).toBe(
      result.expectedCase.expectedRevenueImpact * 0.5
    );
  });

  it("advertising impact is 0 for restock (no ad spend involved)", () => {
    const result = SimulationService.simulateRestock(10, 14, 500, 100);
    expect(result.bestCase.expectedAdvertisingImpact).toBe(0);
    expect(result.expectedCase.expectedAdvertisingImpact).toBe(0);
    expect(result.worstCase.expectedAdvertisingImpact).toBe(0);
  });

  it("returns zero impact when velocity is 0", () => {
    const result = SimulationService.simulateRestock(0, 14, 500, 100);
    expect(result.expectedCase.expectedRevenueImpact).toBe(0);
    expect(result.expectedCase.expectedProfitImpact).toBe(0);
  });
});
