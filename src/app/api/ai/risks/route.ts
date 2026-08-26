import { NextResponse } from "next/server";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { RiskRadar } from "@/lib/ai/risk-radar";
import { log } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    const user = await authenticate(req);
    requirePermission(user, "finance.read");

    log.info(`[API/Risks] Scanning for business risks`, undefined, {
      userId: user.userId,
    });

    const response = await RiskRadar.scan(user.userId, user.workspaceId);

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    log.error(`[API/Risks] Failed to scan for risks`, undefined, {
      error: error instanceof Error ? error.message : "Unknown risk scan error.",
    });
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
