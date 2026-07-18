import { NextResponse } from "next/server";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";
import { BusinessSimulator } from "@/lib/ai/business-simulator";
import { log } from "@/lib/logger";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await authenticateWithDevFallback(req);
    const body = await req.json();
    const { scenario } = body;

    if (!scenario) {
      return NextResponse.json({ error: "Scenario is required" }, { status: 400 });
    }

    log.info(`[API/Simulate] Running business simulation`, undefined, {
      userId: user.userId,
      scenario
    });

    const response = await BusinessSimulator.simulate(user.userId, scenario);

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    log.error(`[API/Simulate] Failed to run simulation`, (error as Error).message);
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
