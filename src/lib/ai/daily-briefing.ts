import { DailyBriefing, DailyBriefingSchema } from "./schemas";
import { generateValidatedJson } from "./schema-validator";
import { BIRepository } from "@/lib/repositories/bi-repository";
import { BusinessHealthEngine } from "./business-health-engine";
import { getAdminClient } from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

export class DailyBriefingGenerator {
  
  static async generate(userId: string): Promise<DailyBriefing> {
    
    // 1. Gather raw data
    const [adsSummary, ordersSummary, inventorySummary, healthResponse] = await Promise.all([
      BIRepository.getAdsSummary(userId),
      BIRepository.getOrdersSummary(userId),
      BIRepository.getInventorySummary(userId),
      BusinessHealthEngine.calculateHealth(userId).catch(() => null)
    ]);
    
    // 2. Fetch Goal Progress
    const adminClient = getAdminClient();
    const { data: goals } = await adminClient
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .limit(1);

    const activeMission = goals && goals.length > 0 ? goals[0] : null;

    // 3. Prepare Context Payload
    const contextPayload = {
      ads: adsSummary,
      orders: ordersSummary,
      inventory: inventorySummary,
      healthScore: healthResponse?.score || 50,
      activeMission: activeMission || { title: "Grow Business", description: "Increase overall profitability" }
    };

    // 4. Construct System Prompt
    const systemPrompt = `
You are SellerPlus AI COO preparing the Owner Daily Briefing.
It is morning. Review yesterday's performance and set the agenda for today.

Here is the VERIFIED business data:
${JSON.stringify(contextPayload, null, 2)}

You MUST output a valid JSON object matching the DailyBriefingSchema.
Be concise, actionable, and encouraging but realistic.
Make sure yesterdaySummary uses the real revenue, profit, and order counts.
    `.trim();

    const startTime = Date.now();
    log.info(`[DailyBriefingGenerator] Generating briefing`, undefined, { userId });

    // 5. Execute LLM Call
    const response = await generateValidatedJson<DailyBriefing>(
      systemPrompt,
      DailyBriefingSchema,
      { temperature: 0.3 },
      userId
    );

    const durationMs = Date.now() - startTime;
    log.info(`[DailyBriefingGenerator] Briefing complete.`, undefined, { 
      durationMs
    });

    return response;
  }
}
