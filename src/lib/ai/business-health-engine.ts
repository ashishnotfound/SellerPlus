import { BusinessHealthResponse, BusinessHealthResponseSchema } from "./schemas";
import { generateValidatedJson } from "./schema-validator";
import { BIRepository } from "@/lib/repositories/bi-repository";
import { KPIService } from "@/lib/services/kpi-service";
import { getAdminClient } from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

export class BusinessHealthEngine {
  
  static async calculateHealth(userId: string): Promise<BusinessHealthResponse> {
    
    // 1. Gather raw data from Repositories Concurrently
    const [adsSummary, ordersSummary, inventorySummary, cogsSummary] = await Promise.all([
      BIRepository.getAdsSummary(userId),
      BIRepository.getOrdersSummary(userId),
      BIRepository.getInventorySummary(userId),
      BIRepository.getCogsSummary(userId),
    ]);
    
    // 2. Fetch Goal Progress (Simplified for now, would use GoalRepository ideally)
    const adminClient = getAdminClient();
    const { data: goals } = await adminClient
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "in_progress");

    // 3. Calculate verified KPIs using KPIService
    const acos = KPIService.calculateACOS(adsSummary.totalSpend, adsSummary.totalSales);
    const roas = KPIService.calculateROAS(adsSummary.totalSpend, adsSummary.totalSales);
    const tacos = KPIService.calculateTACOS(adsSummary.totalSpend, ordersSummary.totalRevenue);

    const totalFees = ordersSummary.totalCommissionFees + ordersSummary.totalFbaFees + ordersSummary.totalShippingCost;
    const profit = KPIService.calculateProfit(
      ordersSummary.totalRevenue,
      cogsSummary.totalCogs,
      totalFees,
      adsSummary.totalSpend,
      0
    );
    const margin = KPIService.calculateMargin(profit, ordersSummary.totalRevenue);

    // 4. Prepare Context Payload
    const contextPayload = {
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
      },
      activeGoals: goals || []
    };

    // 5. Construct System Prompt
    const systemPrompt = `
You are SellerPlus AI COO, an elite Amazon business advisor.
Your objective is to calculate the overall Business Health Score (0-100) and its components based on the verified data.

Here is the VERIFIED business data (Do NOT hallucinate or guess any metrics):
${JSON.stringify(contextPayload, null, 2)}

You MUST output a valid JSON object matching the BusinessHealthResponseSchema.
Analyze the Revenue, Profitability, Advertising Efficiency, Inventory Health, and Goal Progress.
Provide a composite score, a trend, key strengths, key weaknesses, and actionable recommendations.
Do not invent any numbers not present in or directly calculable from the payload.
    `.trim();

    const startTime = Date.now();
    log.info(`[BusinessHealthEngine] Starting health calculation`, undefined, { userId });

    // 6. Execute LLM Call with Auto-Repair Zod Validation
    const response = await generateValidatedJson<BusinessHealthResponse>(
      systemPrompt,
      BusinessHealthResponseSchema,
      { temperature: 0.1 },
      userId
    );

    const durationMs = Date.now() - startTime;
    log.info(`[BusinessHealthEngine] Health calculation complete.`, undefined, { 
      durationMs, 
      score: response.score
    });

    // 7. Record score to telemetry/db if needed (Placeholder)

    return response;
  }
}
