import { RadarResponseSchema, type RadarItem, type RadarResponse } from "./schemas";
import { BIRepository, type BusinessSummary } from "@/lib/repositories/bi-repository";
import { KPIService } from "@/lib/services/kpi-service";
import { buildDeterministicRecommendations } from "./bi-engine";
import { log } from "@/lib/logger";

function contributionProfit(summary: BusinessSummary): number | null {
  if (summary.cogs.totalCogs === null || !summary.ads.dataAvailable) return null;
  const fees = summary.orders.totalCommissionFees
    + summary.orders.totalFbaFees
    + summary.orders.totalShippingCost;
  return KPIService.calculateProfit(
    summary.orders.totalRevenue,
    summary.cogs.totalCogs,
    fees,
    summary.ads.totalSpend,
  );
}

export function buildDeterministicRisks(summary: BusinessSummary): RadarResponse {
  const recommendations = buildDeterministicRecommendations(summary, contributionProfit(summary));
  const items: RadarItem[] = recommendations.map((item) => ({
    id: `risk-${item.id}`,
    title: item.recommendation,
    description: item.aiReasoning,
    severityOrImpact: item.priority,
    confidence: item.confidence,
    confidenceReason: item.confidenceReason,
    evidence: item.evidence,
    dataSources: item.sourceTables,
    recommendedAction: item,
  }));

  return RadarResponseSchema.parse({
    kind: "risk",
    methodology: "deterministic_evidence_v1",
    dataWindow: summary.dataWindow,
    dataSources: [
      summary.orders.dataSource,
      summary.inventory.dataSource,
      summary.cogs.dataSource,
      ...(summary.ads.dataAvailable ? [summary.ads.dataSource] : []),
    ],
    limitations: [
      "This scan uses aggregate operational facts and does not infer campaign-, keyword-, or SKU-level causes that are absent from the source data.",
      "Expected financial impact is not estimated without a validated deterministic model and the required granular inputs.",
      "Custom operating expenses are not included in contribution-profit checks.",
    ],
    items,
  });
}

export class RiskRadar {
  static async scan(userId: string, workspaceId: string): Promise<RadarResponse> {
    const startTime = Date.now();
    log.info("[RiskRadar] Starting deterministic scan", undefined, { userId, workspaceId });
    const summary = await BIRepository.getBusinessSummary(workspaceId);
    const response = buildDeterministicRisks(summary);

    const durationMs = Date.now() - startTime;
    log.info("[RiskRadar] Deterministic scan complete.", undefined, {
      durationMs,
      risksFound: response.items.length,
      workspaceId,
    });
    return response;
  }
}
