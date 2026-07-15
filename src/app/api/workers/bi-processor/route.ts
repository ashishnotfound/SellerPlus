/**
 * GET /api/workers/bi-processor?secret=<CRON_SECRET>
 *
 * Cron-triggered worker that processes queued bi_jobs.
 * This is the ONLY place that executes job handlers.
 *
 * Architecture:
 *   - Job dispatch is driven by the typed JOB_REGISTRY — no switch statements.
 *   - Adding a new job type requires only a registry entry in job-registry.ts.
 *   - Atomic status transitions: queued → processing → completed/failed
 *   - Retries up to registryEntry.retryPolicy.maxAttempts on failure
 *   - Structured telemetry: duration, cost, retry count logged per job
 *
 * Backward compatibility:
 *   - Legacy "bi_analysis" jobs dispatched by the old bi-processor still work —
 *     they are registered in JOB_REGISTRY as "bi_analysis".
 */

import { NextResponse } from "next/server";
import { authenticateCron, authErrorResponse, getAdminClient } from "@/lib/auth-middleware";
import { getJobEntry } from "@/lib/jobs/job-registry";
import type { JobContext } from "@/lib/jobs/job-registry";
import { log } from "@/lib/logger";

export const maxDuration = 60;

const BATCH_SIZE = 5; // Process up to 5 jobs per cron tick

export async function GET(request: Request): Promise<NextResponse> {
  try {
    authenticateCron(request);
    const adminClient = getAdminClient();

    // 1. Fetch next batch of queued jobs, highest priority first
    const { data: jobs, error: fetchError } = await adminClient
      .from("bi_jobs")
      .select("id, user_id, job_type, payload, attempts, max_attempts")
      .eq("status", "queued")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      log.error(`[BiProcessor] Failed to fetch jobs: ${fetchError.message}`);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ processed: 0, message: "No queued jobs." });
    }

    const results: Array<{ jobId: string; status: string; jobType: string }> = [];

    for (const job of jobs) {
      const jobId = job.id as string;
      const jobType = (job.job_type as string) ?? "bi_analysis";

      // 2. Look up handler in registry — skip unknown job types with a warning
      const registryEntry = getJobEntry(jobType);
      if (!registryEntry) {
        log.warn(`[BiProcessor] Unknown job type "${jobType}" for job ${jobId}. Failing immediately.`);
        await adminClient
          .from("bi_jobs")
          .update({
            status: "failed",
            error: `Unknown job type: "${jobType}". No handler registered.`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        results.push({ jobId, status: "failed", jobType });
        continue;
      }

      try {
        // 3. Atomically claim the job (queued → processing)
        const { error: claimError } = await adminClient
          .from("bi_jobs")
          .update({
            status: "processing",
            started_at: new Date().toISOString(),
            attempts: (job.attempts as number) + 1,
          })
          .eq("id", jobId)
          .eq("status", "queued"); // Only claim if still queued (prevents double-processing)

        if (claimError) {
          log.warn(`[BiProcessor] Could not claim job ${jobId}: ${claimError.message}`);
          continue;
        }

        const startTime = Date.now();
        log.info(`[BiProcessor] Executing "${jobType}" job ${jobId}`, undefined, {
          userId: job.user_id,
          jobType,
          attempt: (job.attempts as number) + 1,
        });

        // 4. Execute via registry handler
        const ctx: JobContext = {
          jobId,
          userId: job.user_id as string,
          payload: (job.payload as Record<string, unknown>) ?? {},
          supabaseAdmin: adminClient,
          scheduleId: (job.payload as any)?._scheduleId,
        };

        const handlerResult = await registryEntry.handler(ctx);
        const durationMs = Date.now() - startTime;

        // 5. Mark completed
        await adminClient
          .from("bi_jobs")
          .update({
            status: "completed",
            result: handlerResult.output,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);

        log.info(`[BiProcessor] Job ${jobId} completed`, undefined, {
          jobType,
          durationMs,
          summary: handlerResult.summary,
          estimatedCostUsd: handlerResult.estimatedCostUsd,
          affectedCount: handlerResult.affectedEntities?.length ?? 0,
        });

        results.push({ jobId, status: "completed", jobType });
      } catch (err: any) {
        const currentAttempts = (job.attempts as number) + 1;
        const maxAttempts = (job.max_attempts as number) ?? registryEntry.retryPolicy.maxAttempts;
        const shouldRetry = currentAttempts < maxAttempts;

        log.error(`[BiProcessor] Job ${jobId} failed (attempt ${currentAttempts}/${maxAttempts})`, undefined, {
          jobId,
          jobType,
          error: err.message,
          willRetry: shouldRetry,
        });

        await adminClient
          .from("bi_jobs")
          .update({
            status: shouldRetry ? "queued" : "failed",
            error: err.message,
            completed_at: shouldRetry ? null : new Date().toISOString(),
          })
          .eq("id", jobId);

        results.push({ jobId, status: shouldRetry ? "requeued" : "failed", jobType });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
