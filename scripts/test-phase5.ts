/**
 * Phase 5A Integration Tests
 * Validates deterministic bounded estimations, health scores, and optimizer logic.
 */
import { KPIService } from "../src/lib/services/kpi-service";
import { SimulationService } from "../src/lib/services/simulation-service";
import { RecommendationOptimizer } from "../src/lib/ai/recommendation-optimizer";

async function runTests() {
  console.log("--- Starting Phase 5A Tests ---");

  // 1. Deterministic Business Health Score
  const health = KPIService.calculateBusinessHealthScore(10, 0.25, 10, 80);
  console.assert(health.components.advertising === 100, "Ad health should be maxed");
  console.assert(health.components.profitability > 50, "Profitability should be positive");
  console.assert(health.components.inventory === 100, "Inventory should be maxed");
  console.assert(health.finalScore > 80, "Final score should be solid");
  console.log("✅ KPI Business Health Score Tests Passed");

  // 2. Simulation Bounds
  const sim = SimulationService.simulatePauseCampaign(1000, 500, 0.2);
  console.assert(sim.expectedCase.expectedProfitImpact === 900, "Waste should be 1000 - 100 = 900");
  console.log("✅ Simulation Bounding Tests Passed");

  // 3. Optimizer Conflict Detection
  const dummyContext = { dataSummaries: { ads: { totalSpend: 1000, totalSales: 500 } } };
  
  const recs: any = [
    {
      id: "r1",
      action: { automationType: "PAUSE_CAMPAIGN", payload: { campaignId: "123" } },
      conflicts: [], dependencies: [], riskLevel: "Medium", lifecycle: "Draft"
    },
    {
      id: "r2",
      action: { automationType: "INCREASE_BUDGET", payload: { campaignId: "123" } },
      conflicts: [], dependencies: [], riskLevel: "High", lifecycle: "Draft"
    }
  ];

  const optimized = RecommendationOptimizer.optimizePipeline(recs, dummyContext);
  
  // r1 should exist, r2 should be dropped due to conflict
  console.assert(optimized.length === 1, "Conflict detection should merge/drop opposing actions");
  console.assert(optimized[0].conflicts.length > 0, "Conflict should be logged in metadata");
  console.assert(optimized[0].simulation?.expectedCase !== undefined, "Simulation should be attached");
  console.log("✅ Optimizer Pipeline Tests Passed");

  console.log("--- All Phase 5A Tests Passed ---");
}

runTests().catch(console.error);
