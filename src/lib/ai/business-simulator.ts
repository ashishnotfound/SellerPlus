import { SimulatorResponse, SimulatorResponseSchema } from "./schemas";
import { generateValidatedJson } from "./schema-validator";
import { BIRepository } from "@/lib/repositories/bi-repository";
import { KPIService } from "@/lib/services/kpi-service";
import { log } from "@/lib/logger";

export class BusinessSimulator {
  
  static async simulate(userId: string, scenario: string): Promise<SimulatorResponse> {
    
    // 1. Gather raw data
    const [adsSummary, ordersSummary, inventorySummary, cogsSummary] = await Promise.all([
      BIRepository.getAdsSummary(userId),
      BIRepository.getOrdersSummary(userId),
      BIRepository.getInventorySummary(userId),
      BIRepository.getCogsSummary(userId),
    ]);
    
    // 2. Prepare Context Payload
    const contextPayload = {
      ads: adsSummary,
      orders: ordersSummary,
      inventory: inventorySummary,
      cogs: cogsSummary,
    };

    // 3. Construct System Prompt
    const systemPrompt = `
You are SellerPlus AI Business Simulator.
The user wants to simulate a specific business scenario.

Current verified business data:
${JSON.stringify(contextPayload, null, 2)}

User's Scenario: "${scenario}"

You MUST output a valid JSON object matching the SimulatorResponseSchema.
Estimate the expected impact on revenue, profit, advertising, inventory, and cash flow.
Assign a risk level, confidence score, and expected timeline in days.
Provide clear assumptions you made to reach these numbers.
    `.trim();

    const startTime = Date.now();
    log.info(`[BusinessSimulator] Starting simulation`, undefined, { userId, scenario });

    // 4. Execute LLM Call
    const response = await generateValidatedJson<SimulatorResponse>(
      systemPrompt,
      SimulatorResponseSchema,
      { temperature: 0.2 },
      userId
    );

    const durationMs = Date.now() - startTime;
    log.info(`[BusinessSimulator] Simulation complete.`, undefined, { 
      durationMs,
      expectedProfitImpact: response.expectedProfitImpact
    });

    return response;
  }
}
