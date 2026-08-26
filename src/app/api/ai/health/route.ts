import { NextResponse } from "next/server";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { BusinessHealthEngine } from "@/lib/ai/business-health-engine";
import { log } from "@/lib/logger";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const user = await authenticate(req);
    requirePermission(user, "finance.read");

    log.info(`[API/Health] Generating business health score`, undefined, {
      userId: user.userId,
    });

    const response = await BusinessHealthEngine.calculateHealth(user.userId, user.workspaceId);

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    log.error(`[API/Health] Failed to generate business health score`, undefined, {
      error: error instanceof Error ? error.message : "Unknown health calculation error.",
    });
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
