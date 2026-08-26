/**
 * POST /api/ai/bi
 *
 * Triggers a BI Engine analysis.
 *
 * Modes:
 *   - Sync (default): Runs the full analysis inline and returns results.
 *     Use for dashboards and chat where immediate response is needed.
 *     Protected by maxDuration=60 for Vercel Pro plans.
 *
 *   - Async (body: { async: true }): Enqueues a job and returns immediately
 *     with { jobId, status: "queued" }. The caller polls /api/ai/bi/status?jobId=...
 *     Use for background re-analysis, scheduled audits, etc.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { BIEngine, AnalysisMode } from "@/lib/ai/bi-engine";
import { jobService } from "@/lib/jobs/job-service";
import { log } from "@/lib/logger";
import { runWithAIRequestContext } from "@/lib/ai/request-context";
import { aiBudgetErrorResponse } from "@/lib/ai/budget";

// Extends the Vercel Serverless Function timeout for synchronous AI calls.
// This has no effect in development or non-Vercel environments.
export const maxDuration = 60;

const requestSchema = z.object({
  mode: z.enum(["Store Audit", "Advertising Audit", "Inventory Audit", "Executive Summary"]).default("Store Audit"),
  goal: z.string().trim().min(1).max(500).default("MAXIMIZE_PROFIT"),
  customPrompt: z.string().trim().max(2_000).optional(),
  async: z.boolean().default(false),
}).strict();

export async function POST(req: Request) {
  try {
    const user = await authenticate(req);
    requirePermission(user, "finance.read");
    const body = requestSchema.parse(await req.json());
    const analysisMode: AnalysisMode = body.mode;
    const optimizationGoal = body.goal;

    // ── Async Mode: enqueue and return immediately ──────────────────
    if (body.async) {
      const job = await jobService.enqueue({
        type: "bi_analysis",
        userId: user.userId,
        workspaceId: user.workspaceId,
        payload: { mode: analysisMode, goal: optimizationGoal, customPrompt: body.customPrompt },
        priority: 5,
      });

      log.info(`[API/BI] Async job enqueued`, undefined, {
        jobId: job.jobId,
        userId: user.userId,
        mode: analysisMode,
      });

      return NextResponse.json(
        { jobId: job.jobId, status: "queued", message: "Analysis queued. Poll /api/ai/bi/status for results." },
        { status: 202 }
      );
    }

    // ── Sync Mode: run inline (dashboard / chat) ────────────────────
    log.info(`[API/BI] Sync analysis: ${analysisMode}`, undefined, { userId: user.userId });

    const result = await runWithAIRequestContext(
      { userId: user.userId, workspaceId: user.workspaceId, feature: "business_intelligence" },
      () => BIEngine.runAnalysis(user.userId, user.workspaceId, analysisMode, optimizationGoal, body.customPrompt),
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid business intelligence request." }, { status: 400 });
    }
    const budget = aiBudgetErrorResponse(error);
    if (budget) return NextResponse.json({ error: budget.error, code: budget.code }, { status: budget.status });
    log.error("[API/BI] Failed", undefined, {
      error: error instanceof Error ? error.message : "Unknown BI error.",
    });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
