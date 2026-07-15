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
import { authenticateWithDevFallback } from "@/lib/auth-middleware";
import { BIEngine, AnalysisMode } from "@/lib/ai/bi-engine";
import { jobService } from "@/lib/jobs/job-service";
import { log } from "@/lib/logger";

// Extends the Vercel Serverless Function timeout for synchronous AI calls.
// This has no effect in development or non-Vercel environments.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await authenticateWithDevFallback(req);

    const body = await req.json();
    const { mode, goal, customPrompt, async: runAsync = false } = body;

    const analysisMode: AnalysisMode = mode || "Store Audit";
    const optimizationGoal: string = goal || "MAXIMIZE_PROFIT";

    // ── Async Mode: enqueue and return immediately ──────────────────
    if (runAsync) {
      const job = await jobService.enqueue({
        type: "bi_analysis",
        userId: user.userId,
        payload: { mode: analysisMode, goal: optimizationGoal, customPrompt },
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

    const result = await BIEngine.runAnalysis(user.userId, analysisMode, optimizationGoal, customPrompt);

    return NextResponse.json(result);
  } catch (error: any) {
    log.error(`[API/BI] Failed: ${error.message}`);
    return NextResponse.json(
      { error: "Business Intelligence analysis failed.", details: error.message },
      { status: 500 }
    );
  }
}
