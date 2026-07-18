/**
 * GET /api/workers/job-processor?secret=<CRON_SECRET>
 *
 * Unified Job Processor Endpoint
 * Processes background tasks from both the BI Engine (job-service) and the Event Bus (event-bus).
 * Uses PostgreSQL SKIP LOCKED via the claim_jobs RPC for bulletproof multi-worker concurrency.
 */

import { NextResponse } from "next/server";
import { authenticateCron, authErrorResponse, getAdminClient } from "@/lib/auth-middleware";
import { getJobEntry, JobContext } from "@/lib/jobs/job-registry";
import { WorkerRegistry } from "@/lib/automation/workers/registry";
import { log } from "@/lib/logger";

export const maxDuration = 60;

const BATCH_SIZE = 5;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    authenticateCron(request);
    const adminClient = getAdminClient();

    // 1. Atomically claim jobs using SKIP LOCKED
    const { data: jobs, error: claimError } = await adminClient.rpc("claim_jobs", {
      batch_size: BATCH_SIZE,
    });

    if (claimError) {
      log.error(`[JobProcessor] Failed to claim jobs: ${claimError.message}`);
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ processed: 0, message: "No pending jobs." });
    }

    const results: Array<{ jobId: string; status: string; jobType: string }> = [];

    // 2. Process each claimed job
    for (const job of jobs) {
      const jobId = job.id;
      const jobType = job.job_type;
      
      const biRegistryEntry = getJobEntry(jobType);
      const eventWorker = WorkerRegistry[jobType];

      if (!biRegistryEntry && !eventWorker) {
        log.warn(`[JobProcessor] Unknown job type "${jobType}" for job ${jobId}. Failing immediately.`);
        await failJob(adminClient, job, `Unknown job type: "${jobType}". No handler registered.`);
        results.push({ jobId, status: "failed", jobType });
        continue;
      }

      try {
        const startTime = Date.now();
        log.info(`[JobProcessor] Executing "${jobType}" job ${jobId}`, undefined, {
          userId: job.user_id,
          jobType,
          attempt: job.attempts + 1,
        });

        // 3a. Execute BI Job Handler
        if (biRegistryEntry) {
          const ctx: JobContext = {
            jobId,
            userId: job.user_id,
            payload: job.payload || {},
            supabaseAdmin: adminClient,
            scheduleId: job.schedule_id,
          };
          const handlerResult = await biRegistryEntry.handler(ctx);
          
          await adminClient
            .from("jobs")
            .update({
              status: "completed",
              result: handlerResult.output,
              completed_at: new Date().toISOString(),
              attempts: job.attempts + 1
            })
            .eq("id", jobId);

          log.info(`[JobProcessor] Job ${jobId} completed`, undefined, {
            jobType,
            durationMs: Date.now() - startTime,
            summary: handlerResult.summary,
          });
        } 
        // 3b. Execute Event Bus Worker
        else if (eventWorker) {
          // Event worker payload is the full emitted event
          await eventWorker.processJob(job.payload);

          await adminClient
            .from("jobs")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              attempts: job.attempts + 1
            })
            .eq("id", jobId);

          log.info(`[JobProcessor] Job ${jobId} completed`, undefined, {
            jobType,
            durationMs: Date.now() - startTime,
          });
        }

        results.push({ jobId, status: "completed", jobType });

      } catch (err: any) {
        const currentAttempts = job.attempts + 1;
        const maxAttempts = job.max_attempts;
        const shouldRetry = currentAttempts < maxAttempts;
        
        let runAt: string | null = null;
        let newStatus = "failed";
        
        if (shouldRetry) {
          newStatus = "pending";
          // Exponential backoff: 2^attempts * 5 minutes
          const delayMinutes = Math.pow(2, currentAttempts - 1) * 5;
          const nextRun = new Date();
          nextRun.setMinutes(nextRun.getMinutes() + delayMinutes);
          runAt = nextRun.toISOString();
        }

        log.error(`[JobProcessor] Job ${jobId} failed (attempt ${currentAttempts}/${maxAttempts})`, undefined, {
          jobId, jobType, error: err.message, willRetry: shouldRetry
        });

        // Append to error log
        const errorLog = Array.isArray(job.error_log) ? job.error_log : [];
        errorLog.push({ attempt: currentAttempts, error: err.message, time: new Date().toISOString() });

        await adminClient
          .from("jobs")
          .update({
            status: newStatus,
            attempts: currentAttempts,
            run_at: runAt || job.run_at,
            error_log: errorLog,
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

async function failJob(adminClient: any, job: any, errorMessage: string) {
  const errorLog = Array.isArray(job.error_log) ? job.error_log : [];
  errorLog.push({ attempt: job.attempts + 1, error: errorMessage, time: new Date().toISOString() });
  
  await adminClient
    .from("jobs")
    .update({
      status: "failed",
      attempts: job.attempts + 1,
      error_log: errorLog,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}
