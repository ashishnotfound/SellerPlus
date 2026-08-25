import { RadarResponseSchema, type RadarResponse } from "./schemas";
import { BIRepository, type BusinessSummary } from "@/lib/repositories/bi-repository";
import { log } from "@/lib/logger";

/**
 * Aggregate account totals can identify areas that need review, but they cannot
 * prove a scale opportunity. Growth, keyword, and campaign opportunities need
 * entity-level trends plus profit coverage, so this scanner intentionally fails
 * closed until those verified inputs are available.
 */
export function buildDeterministicOpportunities(summary: BusinessSummary): RadarResponse {
  return RadarResponseSchema.parse({
    kind: "opportunity",
    methodology: "deterministic_evidence_v1",
    dataWindow: summary.dataWindow,
    dataSources: [
      summary.orders.dataSource,
      summary.inventory.dataSource,
      summary.cogs.dataSource,
      ...(summary.ads.dataAvailable ? [summary.ads.dataSource] : []),
    ],
    limitations: [
      "No opportunity is emitted from account-level aggregates alone.",
      "Verified opportunities require entity-level period comparisons and complete economics, including COGS and advertising spend.",
      "SellerPlus does not invent sales lift, demand, keyword volume, or expected financial impact.",
    ],
    items: [],
  });
}

export class OpportunityRadar {
  static async scan(userId: string, workspaceId: string): Promise<RadarResponse> {
    const startTime = Date.now();
    log.info("[OpportunityRadar] Starting deterministic scan", undefined, { userId, workspaceId });
    const summary = await BIRepository.getBusinessSummary(workspaceId);
    const response = buildDeterministicOpportunities(summary);

    const durationMs = Date.now() - startTime;
    log.info("[OpportunityRadar] Deterministic scan complete.", undefined, {
      durationMs,
      opportunitiesFound: response.items.length,
      workspaceId,
    });
    return response;
  }
}
