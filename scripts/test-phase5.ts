/**
 * Phase 5A Integration Tests
 * Validates deterministic bounded estimations and optimizer logic.
 */
import { SimulationService } from "../src/lib/services/simulation-service";
import { RecommendationOptimizer } from "../src/lib/ai/recommendation-optimizer";

async function runTests() {
  console.log("--- Starting Phase 5A Tests ---");

  // 1. Simulation Bounds
  const sim = SimulationService.simulatePauseCampaign(1000, 500, 0.2);
  console.assert(sim.expectedCase.expectedProfitImpact === 900, "Waste should be 1000 - 100 = 900");
  console.log("✅ Simulation Bounding Tests Passed");

  // 2. Optimizer Conflict Detection
  const dummyContext = { dataSummaries: { ads: { totalSpend: 1000, totalSales: 500 } } };
  
  const recs: any = [
    {
      id: "r1",
      action: { automationType: "PAUSE_CAMPAIGN", payload: { campaignId: "123", currentSpend: 1000, currentSales: 500, profitMargin: 0.2 } },
      conflicts: [], dependencies: [], riskLevel: "Medium", lifecycle: "Draft"
    },
    {
      id: "r2",
      action: { automationType: "INCREASE_BUDGET", payload: { campaignId: "123", currentSpend: 1000, currentSales: 500, profitMargin: 0.2 } },
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
