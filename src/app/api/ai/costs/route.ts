import { NextResponse } from "next/server";
import { authenticateWithDevFallback, authErrorResponse, getAdminClient } from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    const user = await authenticateWithDevFallback(req);

    log.info(`[API/Costs] Fetching AI usage costs`, undefined, {
      userId: user.userId,
    });

    const adminClient = getAdminClient();
    
    // In a real app, this would be an aggregation query.
    // For now, we just fetch logs and aggregate them in code.
    const { data: logs, error } = await adminClient
      .from("ai_usage_logs")
      .select("*")
      .eq("user_id", user.userId);

    if (error) {
      throw error;
    }

    let totalCostUsd = 0;
    const providerSplit: Record<string, number> = {
      xAI: 0,
      Anthropic: 0,
      OpenAI: 0,
    };

    logs.forEach(log => {
      totalCostUsd += Number(log.estimated_cost_usd);
      if (providerSplit[log.provider] !== undefined) {
        providerSplit[log.provider] += Number(log.estimated_cost_usd);
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        totalCostUsd,
        providerSplit,
        totalRequests: logs.length,
      }
    });
  } catch (error) {
    log.error(`[API/Costs] Failed to fetch costs`, (error as Error).message);
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
