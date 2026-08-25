/**
 * SellerPlus OS — Recommendation Optimizer Pipeline
 * 
 * Post-processes LLM-generated recommendations to guarantee determinism,
 * detect conflicts, enforce dependency graphs, and assign mathematical bounds.
 */

import { ExplainableRecommendation } from "./schemas";
import { SimulationService } from "@/lib/services/simulation-service";
import { KPIService } from "@/lib/services/kpi-service";
import { log } from "@/lib/logger";

export class RecommendationOptimizer {
  
  /**
   * Executes the multi-stage post-processing pipeline on raw LLM recommendations.
   */
  static optimizePipeline(
    rawRecs: ExplainableRecommendation[],
    contextData: any
  ): ExplainableRecommendation[] {
    let recs = [...rawRecs];

    recs = this.removeDuplicates(recs);
    recs = this.detectAndResolveConflicts(recs);
    recs = this.assignDeterministicImpact(recs, contextData);
    recs = this.assignDeterministicConfidence(recs, contextData);
    recs = this.resolveDependencies(recs);

    return recs;
  }

  /**
   * Stage 1: Deduplication
   * Removes recommendations with identical core actions on the same entities.
   */
  private static removeDuplicates(recs: ExplainableRecommendation[]): ExplainableRecommendation[] {
    const seen = new Set<string>();
    return recs.filter(r => {
      if (!r.action) return true;
      const key = `${r.action.automationType}-${JSON.stringify(r.action.payload)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Stage 2: Conflict Detection
   * Prevents mutually exclusive actions (e.g., Pause vs Increase Budget on same Campaign).
   */
  private static detectAndResolveConflicts(recs: ExplainableRecommendation[]): ExplainableRecommendation[] {
    const safeRecs: ExplainableRecommendation[] = [];
    const actionMap = new Map<string, ExplainableRecommendation>();

    for (const r of recs) {
      if (!r.action) {
        safeRecs.push(r);
        continue;
      }

      // Check for opposing actions on the same payload entity
      const entityId = JSON.stringify(r.action.payload);
      
      if (r.action.automationType === "PAUSE_CAMPAIGN") {
        if (actionMap.has(`INCREASE_BUDGET:${entityId}`)) {
          log.warn(`[Optimizer] Conflict detected: Pause vs Increase Budget for ${entityId}. Dropping Pause.`);
          actionMap.get(`INCREASE_BUDGET:${entityId}`)!.conflicts.push(`PAUSE_CAMPAIGN:${entityId}`);
          continue; 
        }
        actionMap.set(`PAUSE_CAMPAIGN:${entityId}`, r);
      } else if (r.action.automationType === "INCREASE_BUDGET") {
        if (actionMap.has(`PAUSE_CAMPAIGN:${entityId}`)) {
          log.warn(`[Optimizer] Conflict detected: Pause vs Increase Budget for ${entityId}. Dropping Budget Increase.`);
          actionMap.get(`PAUSE_CAMPAIGN:${entityId}`)!.conflicts.push(`INCREASE_BUDGET:${entityId}`);
          continue;
        }
        actionMap.set(`INCREASE_BUDGET:${entityId}`, r);
      }
      
      safeRecs.push(r);
    }
    return safeRecs;
  }

  /**
   * Stage 3: Assign Deterministic Impact (Simulation)
   * Overrides LLM hallucinated impacts with rigid bounding boxes.
   */
  private static assignDeterministicImpact(recs: ExplainableRecommendation[], context: any): ExplainableRecommendation[] {
    return recs.map(r => {
      // Model-provided impact numbers are never trusted. Only the bounded,
      // deterministic cases below may attach a simulation.
      r.simulation = undefined;
      if (r.action?.automationType === "PAUSE_CAMPAIGN") {
        const spend = Number(r.action.payload.currentSpend);
        const sales = Number(r.action.payload.currentSales);
        const margin = Number(r.action.payload.profitMargin);
        if (Number.isFinite(spend) && spend >= 0 && Number.isFinite(sales) && sales >= 0 && Number.isFinite(margin) && margin >= 0 && margin <= 1) {
          r.simulation = SimulationService.simulatePauseCampaign(spend, sales, margin);
        } else {
          r.simulation = undefined;
        }
      } else if (r.action?.automationType === "RAISE_PRICE") {
        const price = Number(r.action.payload.currentPrice);
        const volume = Number(r.action.payload.currentVolume);
        const increase = Number(r.action.payload.increasePercent);
        if (Number.isFinite(price) && price > 0 && Number.isFinite(volume) && volume >= 0 && Number.isFinite(increase) && increase > 0 && increase <= 1) {
          r.simulation = SimulationService.simulatePriceIncrease(price, volume, increase);
        } else {
          r.simulation = undefined;
        }
      }
      return r;
    });
  }

  /**
   * Stage 4: Assign Deterministic Confidence
   * Overrides LLM confidence scores using KPIService statistical rules.
   * Uses real data richness from context — not hardcoded constants.
   */
  private static assignDeterministicConfidence(recs: ExplainableRecommendation[], context: any): ExplainableRecommendation[] {
    // FIX: Derive real data richness from the context payload
    const totalOrders = context?.dataSummaries?.orders?.totalOrders ?? 0;
    const campaignCount = context?.dataSummaries?.ads?.campaignCount ?? 0;
    const totalItems = context?.dataSummaries?.inventory?.totalItems ?? 0;
    const listingsWithCostProfile = context?.dataSummaries?.cogs?.listingsWithCostProfile ?? 0;

    // Data points = total observable business events
    const dataPoints = totalOrders + campaignCount + totalItems;

    // Missing fields: count key areas with no data
    let missing = 0;
    if (totalOrders === 0) missing++;
    if (campaignCount === 0) missing++;
    if (totalItems === 0) missing++;
    if (listingsWithCostProfile === 0) missing++; // No COGS linked — profit calc incomplete

    const freshnessAge = context?.dataFreshness?.ageDays;
    const hasMeasuredFreshness = Number.isFinite(freshnessAge) && freshnessAge >= 0;
    const baseConfidence = KPIService.calculateConfidenceScore(
      dataPoints,
      missing,
      hasMeasuredFreshness ? freshnessAge : 0,
      0,
    ) - (hasMeasuredFreshness ? 0 : 10);

    return recs.map(r => {
      // Lower confidence for High Risk actions
      const riskPenalty = r.riskLevel === "High" ? 20 : r.riskLevel === "Medium" ? 10 : 0;
      r.confidence = Math.min(100, Math.max(0, baseConfidence - riskPenalty));

      const dataDescription = dataPoints > 0
        ? `${dataPoints} data points (${totalOrders} orders, ${campaignCount} campaigns, ${totalItems} listings)`
        : "insufficient data";
      r.confidenceReason = `Calculated from ${dataDescription}. Missing data penalties: ${missing}. ${hasMeasuredFreshness ? `Source age: ${freshnessAge} days.` : "Freshness not measured: -10."} Risk adjustment: -${riskPenalty}.`;
      return r;
    });
  }

  /**
   * Stage 5: Resolve Dependencies
   * Topologically sorts recommendations to ensure prerequisite actions occur first.
   */
  private static resolveDependencies(recs: ExplainableRecommendation[]): ExplainableRecommendation[] {
    const riskWeight = { Low: 1, Medium: 2, High: 3 };
    const byId = new Map(recs.map((recommendation, index) => [recommendation.id, { recommendation, index }]));
    const indegree = new Map(recs.map((recommendation) => [recommendation.id, 0]));
    const dependents = new Map<string, string[]>();

    for (const recommendation of recs) {
      for (const dependencyId of new Set(recommendation.dependencies)) {
        if (!byId.has(dependencyId) || dependencyId === recommendation.id) continue;
        indegree.set(recommendation.id, (indegree.get(recommendation.id) ?? 0) + 1);
        dependents.set(dependencyId, [...(dependents.get(dependencyId) ?? []), recommendation.id]);
      }
    }

    const rank = (left: string, right: string) => {
      const a = byId.get(left)!;
      const b = byId.get(right)!;
      return riskWeight[a.recommendation.riskLevel] - riskWeight[b.recommendation.riskLevel]
        || a.index - b.index;
    };
    const ready = recs.filter((item) => indegree.get(item.id) === 0).map((item) => item.id).sort(rank);
    const ordered: ExplainableRecommendation[] = [];

    while (ready.length > 0) {
      const currentId = ready.shift()!;
      ordered.push(byId.get(currentId)!.recommendation);
      for (const dependentId of dependents.get(currentId) ?? []) {
        const remaining = (indegree.get(dependentId) ?? 1) - 1;
        indegree.set(dependentId, remaining);
        if (remaining === 0) {
          ready.push(dependentId);
          ready.sort(rank);
        }
      }
    }

    if (ordered.length !== recs.length) {
      const orderedIds = new Set(ordered.map((item) => item.id));
      const cyclic = recs.filter((item) => !orderedIds.has(item.id)).sort((a, b) => riskWeight[a.riskLevel] - riskWeight[b.riskLevel]);
      log.warn(`[Optimizer] Dependency cycle detected across ${cyclic.length} recommendations. Keeping them review-only.`);
      for (const recommendation of cyclic) {
        recommendation.action = undefined;
        recommendation.conflicts = Array.from(new Set([...recommendation.conflicts, "dependency_cycle"]));
      }
      ordered.push(...cyclic);
    }

    return ordered;
  }
}
