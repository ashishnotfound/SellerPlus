import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { BusinessSimulator } from "@/lib/ai/business-simulator";
import { log } from "@/lib/logger";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await authenticate(req);
    requirePermission(user, "finance.read");
    const { scenario } = z.object({ scenario: z.string().trim().min(5).max(500) }).strict().parse(await req.json());

    log.info(`[API/Simulate] Running business simulation`, undefined, {
      userId: user.userId,
      scenario
    });

    const response = await BusinessSimulator.simulate(user.userId, user.workspaceId, scenario);

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    log.error(`[API/Simulate] Failed to run simulation`, (error as Error).message);
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid scenario." }, { status: 400 });
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
