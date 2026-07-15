/**
 * Unit Tests — RecommendationOptimizer
 *
 * Validates the 5-stage deterministic post-processing pipeline:
 * 1. Deduplication
 * 2. Conflict detection
 * 3. Impact assignment
 * 4. Confidence scoring
 * 5. Dependency resolution
 *
 * Uses minimal mock recommendations to isolate each stage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecommendationOptimizer } from "../lib/ai/recommendation-optimizer";
import { ExplainableRecommendation } from "../lib/ai/schemas";

// ─── Test Fixtures ─────────────────────────────────────────────────────

function makeRec(overrides: Partial<ExplainableRecommendation>): ExplainableRecommendation {
  return {
    id: "rec-001",
    recommendation: "Test recommendation",
    priority: "Medium",
    confidence: 80,
    confidenceReason: "Test",
    evidence: ["metric A = 50%"],
    sourceTables: ["advertising_campaigns"],
    sourceKPIs: ["ACOS"],
    aiReasoning: "Based on ACOS being high",
    dependencies: [],
    conflicts: [],
    riskLevel: "Low",
    estimatedTime: "5 minutes",
    lifecycle: "Draft",
    action: undefined,
    simulation: undefined,
    ...overrides,
  };
}

const mockContext = {
  dataSummaries: {
    ads: { totalSpend: 10000, totalSales: 5000 },
    orders: { totalRevenue: 20000, totalOrders: 150 },
    inventory: { totalItems: 50 },
  },
};

// ─── Deduplication (Stage 1) ──────────────────────────────────────────

describe("RecommendationOptimizer — Stage 1: Deduplication", () => {
  it("removes recommendations with identical action type and payload", () => {
    const recs = [
      makeRec({
        id: "rec-001",
        action: {
          automationType: "PAUSE_CAMPAIGN",
          payload: { campaignId: "camp-123" },
          requiresApproval: true,
          supportsRollback: true,
        },
      }),
      makeRec({
        id: "rec-002",
        action: {
          automationType: "PAUSE_CAMPAIGN",
          payload: { campaignId: "camp-123" },
          requiresApproval: true,
          supportsRollback: true,
        },
      }),
    ];

    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    const pauseActions = result.filter((r) => r.action?.automationType === "PAUSE_CAMPAIGN");
    expect(pauseActions.length).toBe(1);
  });

  it("preserves recommendations with different payloads (different campaigns)", () => {
    const recs = [
      makeRec({
        id: "rec-001",
        action: {
          automationType: "PAUSE_CAMPAIGN",
          payload: { campaignId: "camp-AAA" },
          requiresApproval: true,
          supportsRollback: true,
        },
      }),
      makeRec({
        id: "rec-002",
        action: {
          automationType: "PAUSE_CAMPAIGN",
          payload: { campaignId: "camp-BBB" },
          requiresApproval: true,
          supportsRollback: true,
        },
      }),
    ];

    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    expect(result.length).toBe(2);
  });

  it("preserves recommendations with no action (manual/advisory)", () => {
    const recs = [
      makeRec({ id: "rec-001", action: undefined }),
      makeRec({ id: "rec-002", action: undefined }),
    ];
    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    expect(result.length).toBe(2);
  });
});

// ─── Conflict Detection (Stage 2) ─────────────────────────────────────

describe("RecommendationOptimizer — Stage 2: Conflict Detection", () => {
  it("drops INCREASE_BUDGET when PAUSE_CAMPAIGN already exists for same entity", () => {
    const entityPayload = { campaignId: "camp-conflict" };
    const recs = [
      makeRec({
        id: "rec-pause",
        action: {
          automationType: "PAUSE_CAMPAIGN",
          payload: entityPayload,
          requiresApproval: true,
          supportsRollback: true,
        },
      }),
      makeRec({
        id: "rec-budget",
        action: {
          automationType: "INCREASE_BUDGET",
          payload: entityPayload,
          requiresApproval: false,
          supportsRollback: false,
        },
      }),
    ];

    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    const types = result.map((r) => r.action?.automationType).filter(Boolean);
    expect(types).not.toContain("INCREASE_BUDGET");
    expect(types).toContain("PAUSE_CAMPAIGN");
  });

  it("does not flag non-conflicting action combinations", () => {
    const recs = [
      makeRec({
        id: "rec-001",
        action: {
          automationType: "PAUSE_CAMPAIGN",
          payload: { campaignId: "camp-A" },
          requiresApproval: true,
          supportsRollback: true,
        },
      }),
      makeRec({
        id: "rec-002",
        action: {
          automationType: "INCREASE_BUDGET",
          payload: { campaignId: "camp-B" },
          requiresApproval: false,
          supportsRollback: false,
        },
      }),
    ];

    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    expect(result.length).toBe(2);
  });
});

// ─── Dependency Resolution (Stage 5) ──────────────────────────────────

describe("RecommendationOptimizer — Stage 5: Dependency Resolution", () => {
  it("sorts lower-risk recommendations before higher-risk ones", () => {
    const recs = [
      makeRec({ id: "rec-high", riskLevel: "High" }),
      makeRec({ id: "rec-low", riskLevel: "Low" }),
      makeRec({ id: "rec-med", riskLevel: "Medium" }),
    ];

    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    const riskLevels = result.map((r) => r.riskLevel);
    const lowIdx = riskLevels.indexOf("Low");
    const medIdx = riskLevels.indexOf("Medium");
    const highIdx = riskLevels.indexOf("High");

    expect(lowIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(highIdx);
  });

  it("places dependency before its dependent", () => {
    const recs = [
      makeRec({ id: "rec-dependent", dependencies: ["rec-foundation"] }),
      makeRec({ id: "rec-foundation", dependencies: [] }),
    ];

    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    const ids = result.map((r) => r.id);
    expect(ids.indexOf("rec-foundation")).toBeLessThan(ids.indexOf("rec-dependent"));
  });
});

// ─── Full Pipeline ─────────────────────────────────────────────────────

describe("RecommendationOptimizer.optimizePipeline", () => {
  it("returns empty array for empty input", () => {
    const result = RecommendationOptimizer.optimizePipeline([], mockContext);
    expect(result).toEqual([]);
  });

  it("preserves all fields that the pipeline does not modify", () => {
    const recs = [makeRec({ id: "rec-001", recommendation: "Lower ACOS" })];
    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    expect(result[0].recommendation).toBe("Lower ACOS");
    expect(result[0].sourceTables).toEqual(["advertising_campaigns"]);
  });

  it("assigns confidence values in 0–100 range", () => {
    const recs = [
      makeRec({ id: "r1", riskLevel: "Low" }),
      makeRec({ id: "r2", riskLevel: "High" }),
    ];
    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    for (const r of result) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    }
  });

  it("assigns lower confidence to High risk recommendations", () => {
    const recs = [
      makeRec({ id: "r-low", riskLevel: "Low" }),
      makeRec({ id: "r-high", riskLevel: "High" }),
    ];
    const result = RecommendationOptimizer.optimizePipeline(recs, mockContext);
    const lowRisk = result.find((r) => r.riskLevel === "Low")!;
    const highRisk = result.find((r) => r.riskLevel === "High")!;
    expect(lowRisk.confidence).toBeGreaterThan(highRisk.confidence);
  });
});
