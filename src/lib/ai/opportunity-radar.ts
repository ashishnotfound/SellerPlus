import { RadarResponse, RadarResponseSchema } from "./schemas";
import { generateValidatedJson } from "./schema-validator";
import { BIRepository } from "@/lib/repositories/bi-repository";
import { KPIService } from "@/lib/services/kpi-service";
import { log } from "@/lib/logger";

export class OpportunityRadar {
  
  static async scan(userId: string): Promise<RadarResponse> {
    
    // 1. Gather raw data
    const [adsSummary, ordersSummary, inventorySummary] = await Promise.all([
      BIRepository.getAdsSummary(userId),
      BIRepository.getOrdersSummary(userId),
      BIRepository.getInventorySummary(userId),
    ]);
    
    // 2. Prepare Context Payload focusing on opportunities
    const contextPayload = {
      ads: adsSummary,
      orders: ordersSummary,
      inventory: inventorySummary,
    };

    // 3. Construct System Prompt
    const systemPrompt = `
You are SellerPlus AI Opportunity Radar.
Your objective is to constantly search for growth opportunities:
- Products growing unusually fast
- Profitable keywords
- Inventory expansion opportunities
- Advertising opportunities (e.g. low ACOS campaigns that could scale)
- Cost reduction opportunities

Here is the VERIFIED business data:
${JSON.stringify(contextPayload, null, 2)}

You MUST output a valid JSON object matching the RadarResponseSchema.
Identify actionable opportunities. Assign impact (Critical/High/Medium/Low), confidence, evidence, and a recommended action for each opportunity.
Only output genuine opportunities backed by the data.
    `.trim();

    const startTime = Date.now();
    log.info(`[OpportunityRadar] Starting scan`, undefined, { userId });

    // 4. Execute LLM Call
    const response = await generateValidatedJson<RadarResponse>(
      systemPrompt,
      RadarResponseSchema,
      { temperature: 0.2 }, // Slightly more creative than risk radar
      userId
    );

    const durationMs = Date.now() - startTime;
    log.info(`[OpportunityRadar] Scan complete.`, undefined, { 
      durationMs, 
      opportunitiesFound: response.items.length
    });

    return response;
  }
}
