import { NextResponse } from "next/server";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { DailyBriefingGenerator } from "@/lib/ai/daily-briefing";
import { log } from "@/lib/logger";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const user = await authenticate(req);
    requirePermission(user, "finance.read");

    log.info(`[API/Briefing] Generating daily briefing`, undefined, {
      userId: user.userId,
    });

    const response = await DailyBriefingGenerator.generate(user.userId, user.workspaceId);

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    log.error(`[API/Briefing] Failed to generate daily briefing`, (error as Error).message);
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
