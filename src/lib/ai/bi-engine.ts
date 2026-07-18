import { BIResponse, BIResponseSchema } from "./schemas";
import { generateValidatedJson } from "./schema-validator";
import { BIRepository } from "@/lib/repositories/bi-repository";
import { KPIService } from "@/lib/services/kpi-service";
import { getAdminClient } from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

export type AnalysisMode = "Store Audit" | "Advertising Audit" | "Inventory Audit" | "Executive Summary";

export class BIEngine {
  
  static async runAnalysis(
    userId: string,
    mode: AnalysisMode,
    goal: string = "MAXIMIZE_PROFIT",
    customPrompt?: string
  ): Promise<BIResponse> {
    
    // 1. Gather raw data from Repositories Concurrently
    const [adsSummary, ordersSummary, inventorySummary, cogsSummary] = await Promise.all([
      BIRepository.getAdsSummary(userId),
      BIRepository.getOrdersSummary(userId),
      BIRepository.getInventorySummary(userId),
      BIRepository.getCogsSummary(userId),
    ]);

    // Guard: if there is no meaningful data yet (new user / no Amazon connected),
    // return an empty response instead of making an LLM call with zero data.
    const hasData =
      ordersSummary.totalRevenue > 0 ||
      ordersSummary.totalOrders > 0 ||
      adsSummary.totalSales > 0 ||
      inventorySummary.totalItems > 0;

    if (!hasData) {
      return { analysisMode: "diagnostic", summary: "", widgets: [], recommendations: [] } as unknown as BIResponse;
    }
    
    // 2. Calculate verified KPIs using KPIService (NO LLM MATH ALLOWED)
    const acos = KPIService.calculateACOS(adsSummary.totalSpend, adsSummary.totalSales);
    const roas = KPIService.calculateROAS(adsSummary.totalSpend, adsSummary.totalSales);
    const tacos = KPIService.calculateTACOS(adsSummary.totalSpend, ordersSummary.totalRevenue);

    // FIX: Use real COGS from cost_profiles and real Amazon fees from orders
    const totalFees = ordersSummary.totalCommissionFees + ordersSummary.totalFbaFees + ordersSummary.totalShippingCost;
    const profit = KPIService.calculateProfit(
      ordersSummary.totalRevenue,
      cogsSummary.totalCogs,
      totalFees,
      adsSummary.totalSpend,
      0
    );
    const margin = KPIService.calculateMargin(profit, ordersSummary.totalRevenue);

    // 3. Prepare Context Payload
    const contextPayload = {
      optimizationGoal: goal,
      kpis: {
        acos: acos.toFixed(2) + "%",
        roas: roas.toFixed(2),
        tacos: tacos.toFixed(2) + "%",
        profit: profit.toFixed(2),
        margin: margin.toFixed(2) + "%"
      },
      dataSummaries: {
        ads: adsSummary,
        orders: ordersSummary,
        inventory: inventorySummary,
        cogs: cogsSummary,
        fees: {
          totalCommissionFees: ordersSummary.totalCommissionFees,
          totalFbaFees: ordersSummary.totalFbaFees,
          totalShippingCost: ordersSummary.totalShippingCost,
          totalFees,
        }
      }
    };


    // 4. Construct System Prompt
    const systemPrompt = `
You are SellerPlus BI Engine, an elite Amazon business advisor.
Your objective is to optimize the user's business based on the goal: ${goal}.
Mode: ${mode}
User Question: ${customPrompt || "Provide a comprehensive audit."}

Here is the VERIFIED business data (Do NOT hallucinate or guess any metrics):
${JSON.stringify(contextPayload, null, 2)}

You MUST output a valid JSON object matching the BIResponseSchema.
Include highly specific 'recommendations' with 'evidence' backed exclusively by the data provided above. Do not invent any numbers.
Include 'widgets' (KPIs, Charts) to visually present these insights to the user.
    `.trim();

    const startTime = Date.now();
    log.info(`[BIEngine] Starting analysis mode: ${mode}`, undefined, { userId, goal });

    // 5. Execute LLM Call with Auto-Repair Zod Validation
    const response = await generateValidatedJson<BIResponse>(
      systemPrompt,
      BIResponseSchema,
      { temperature: 0.2 },
      userId
    );

    // 5b. Post-Process via Recommendation Optimizer Pipeline (Phase 5A)
    const { RecommendationOptimizer } = await import("./recommendation-optimizer");
    response.recommendations = RecommendationOptimizer.optimizePipeline(
      response.recommendations,
      contextPayload
    );

    const durationMs = Date.now() - startTime;
    log.info(`[BIEngine] Analysis complete.`, undefined, { 
      durationMs, 
      recommendationCount: response.recommendations.length,
      widgetsCount: response.widgets.length
    });

    // 6. Record Recommendations to AI Memory
    await this.recordRecommendations(userId, response, goal);

    return response;
  }

  private static async recordRecommendations(userId: string, response: BIResponse, goal: string) {
    const adminClient = getAdminClient();
    
    for (const rec of response.recommendations) {
      try {
        await adminClient.from("ai_recommendation_history").insert({
          user_id: userId,
          recommendation: rec.recommendation || rec.aiReasoning, // Map fallback if needed
          confidence: rec.confidence,
          confidence_reason: rec.confidenceReason,
          evidence: rec.evidence,
          source_tables: rec.sourceTables,
          source_kpis: rec.sourceKPIs,
          ai_reasoning: rec.aiReasoning,
          simulation: rec.simulation,
          dependencies: rec.dependencies,
          conflicts: rec.conflicts,
          risk_level: rec.riskLevel,
          estimated_time: rec.estimatedTime,
          lifecycle: rec.lifecycle,
          action_type: rec.action?.automationType || null,
          action_payload: rec.action?.payload || null,
          status: "pending"
        });
      } catch (err) {
        log.warn(`[BIEngine] Failed to record recommendation memory: ${err}`);
      }
    }
  }
}
