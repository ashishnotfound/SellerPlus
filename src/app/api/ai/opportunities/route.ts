import { NextResponse } from "next/server";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { OpportunityRadar } from "@/lib/ai/opportunity-radar";
import { log } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    const user = await authenticate(req);
    requirePermission(user, "finance.read");

    log.info(`[API/Opportunities] Scanning for business opportunities`, undefined, {
      userId: user.userId,
    });

    const response = await OpportunityRadar.scan(user.userId, user.workspaceId);

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    log.error(`[API/Opportunities] Failed to scan for opportunities`, (error as Error).message);
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
