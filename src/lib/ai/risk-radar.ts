import { RadarResponse, RadarResponseSchema } from "./schemas";
import { generateValidatedJson } from "./schema-validator";
import { BIRepository } from "@/lib/repositories/bi-repository";
import { KPIService } from "@/lib/services/kpi-service";
import { log } from "@/lib/logger";

export class RiskRadar {
  
  static async scan(userId: string): Promise<RadarResponse> {
    
    // 1. Gather raw data
    const [adsSummary, ordersSummary, inventorySummary, cogsSummary] = await Promise.all([
      BIRepository.getAdsSummary(userId),
      BIRepository.getOrdersSummary(userId),
      BIRepository.getInventorySummary(userId),
      BIRepository.getCogsSummary(userId),
    ]);
    
    // 2. Prepare Context Payload focusing on potential risks
    const contextPayload = {
      ads: adsSummary,
      orders: ordersSummary,
      inventory: {
        totalItems: inventorySummary.totalItems,
        outOfStockItems: inventorySummary.outOfStockItems,
        lowStockItems: inventorySummary.lowStockItems, // Usually items with < 7 days stock
      },
      cogs: cogsSummary,
    };

    // 3. Construct System Prompt
    const systemPrompt = `
You are SellerPlus AI Risk Radar.
Your objective is to continuously monitor the business for risks:
- Low inventory
- High ACOS
- Profit decline
- Negative cash flow
- Failed syncs
- Worker delays

Here is the VERIFIED business data:
${JSON.stringify(contextPayload, null, 2)}

You MUST output a valid JSON object matching the RadarResponseSchema.
Identify current or impending risks. Assign severity, confidence, evidence, and a recommended action for each risk.
Only output genuine risks backed by the data. If there are no severe risks, return an empty items array or only low severity items.
    `.trim();

    const startTime = Date.now();
    log.info(`[RiskRadar] Starting scan`, undefined, { userId });

    // 4. Execute LLM Call
    const response = await generateValidatedJson<RadarResponse>(
      systemPrompt,
      RadarResponseSchema,
      { temperature: 0.1 },
      userId
    );

    const durationMs = Date.now() - startTime;
    log.info(`[RiskRadar] Scan complete.`, undefined, { 
      durationMs, 
      risksFound: response.items.length
    });

    return response;
  }
}
