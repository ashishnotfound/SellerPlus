/**
 * GET /api/workers/job-processor?secret=<CRON_SECRET>
 *
 * Unified Job Processor Endpoint
 * Processes background tasks from both the BI Engine (job-service) and the Event Bus (event-bus).
 * Uses PostgreSQL SKIP LOCKED via the claim_jobs RPC for bulletproof multi-worker concurrency.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateCron, authErrorResponse } from "@/lib/auth-middleware";
import { getJobEntry, JobContext } from "@/lib/jobs/job-registry";
import { WorkerRegistry } from "@/lib/automation/workers/registry";
import { log } from "@/lib/logger";
import { runWithAIRequestContext } from "@/lib/ai/request-context";
import {
  ExecutionDeadlineError,
  runBeforeDeadline,
} from "@/lib/execution-deadline";

export const maxDuration = 60;

const CLAIM_BATCH_SIZE = 1;
const PERSISTENCE_RESERVE_MS = 8_000;

export async function GET(request: Request): Promise<NextResponse> {
  const routeStartedAt = Date.now();
  const executionDeadlineAt = routeStartedAt + maxDuration * 1_000 - PERSISTENCE_RESERVE_MS;
  try {
    const { supabaseAdmin: adminClient } = await authenticateCron(request);
    const workerName = process.env.SELLERPLUS_WORKER_ID || "web-job-processor";

    // 1. Atomically claim jobs using SKIP LOCKED
    const { data: jobs, error: claimError } = await adminClient.rpc("claim_jobs", {
      batch_size: CLAIM_BATCH_SIZE,
      worker_name: workerName,
      lock_timeout_seconds: 300,
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

      if (!job.workspace_id || !job.user_id) {
        await failJob(adminClient, job, "Job is missing its tenant or user owner.");
        results.push({ jobId, status: "failed", jobType });
        continue;
      }
      
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
        const controller = new AbortController();
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
            workspaceId: job.workspace_id,
            payload: job.payload || {},
            supabaseAdmin: adminClient,
            scheduleId: job.schedule_id,
            deadlineAt: executionDeadlineAt,
            signal: controller.signal,
          };
          const handlerResult = await runBeforeDeadline(
            () => runWithAIRequestContext(
              {
                userId: job.user_id,
                workspaceId: job.workspace_id,
                feature: `job:${jobType}`,
                deadlineAt: executionDeadlineAt,
                signal: controller.signal,
              },
              () => biRegistryEntry.handler(ctx),
            ),
            executionDeadlineAt,
            controller,
          );

          if (handlerResult.continuation) {
            const resumeAt = new Date(
              Date.now() + Math.max(5, handlerResult.continuation.delaySeconds) * 1_000,
            ).toISOString();
            await adminClient
              .from("jobs")
              .update({
                status: "waiting",
                payload: handlerResult.continuation.payload,
                progress: Math.min(99, Math.max(0, handlerResult.continuation.progress)),
                result: { summary: handlerResult.continuation.summary },
                run_at: resumeAt,
                locked_by: null,
                locked_until: null,
              })
              .eq("id", jobId)
              .eq("workspace_id", job.workspace_id);

            results.push({ jobId, status: "waiting", jobType });
            continue;
          }
          
          await adminClient
            .from("jobs")
            .update({
              status: "completed",
              result: handlerResult.output,
              progress: 100,
              completed_at: new Date().toISOString(),
              attempts: job.attempts + 1,
              locked_by: null,
              locked_until: null,
            })
            .eq("id", jobId)
            .eq("workspace_id", job.workspace_id);

          log.info(`[JobProcessor] Job ${jobId} completed`, undefined, {
            jobType,
            durationMs: Date.now() - startTime,
            summary: handlerResult.summary,
          });
        } 
        // 3b. Execute Event Bus Worker
        else if (eventWorker) {
          // Event worker payload is the full emitted event
          await runBeforeDeadline(
            () => runWithAIRequestContext(
              {
                userId: job.user_id,
                workspaceId: job.workspace_id,
                feature: `job:${jobType}`,
                deadlineAt: executionDeadlineAt,
                signal: controller.signal,
              },
              () => eventWorker.processJob(job.payload),
            ),
            executionDeadlineAt,
            controller,
          );

          await adminClient
            .from("jobs")
            .update({
              status: "completed",
              progress: 100,
              completed_at: new Date().toISOString(),
              attempts: job.attempts + 1,
              locked_by: null,
              locked_until: null,
            })
            .eq("id", jobId)
            .eq("workspace_id", job.workspace_id);

          log.info(`[JobProcessor] Job ${jobId} completed`, undefined, {
            jobType,
            durationMs: Date.now() - startTime,
          });
        }

        results.push({ jobId, status: "completed", jobType });

      } catch (err) {
        const errorMessage = err instanceof ExecutionDeadlineError
          ? "Worker execution deadline reached; the job will continue on a later invocation."
          : err instanceof Error ? err.message : "Unknown worker failure";
        const currentAttempts = job.attempts + 1;
        const maxAttempts = job.max_attempts;
        const shouldRetry = currentAttempts < maxAttempts;
        
        let runAt: string | null = null;
        let newStatus = "failed";
        
        if (shouldRetry) {
          newStatus = "retrying";
          // Exponential backoff: 2^attempts * 5 minutes
          const delayMinutes = Math.pow(2, currentAttempts - 1) * 5;
          const nextRun = new Date();
          nextRun.setMinutes(nextRun.getMinutes() + delayMinutes);
          runAt = nextRun.toISOString();
        }

        log.error(`[JobProcessor] Job ${jobId} failed (attempt ${currentAttempts}/${maxAttempts})`, undefined, {
          jobId, jobType, error: errorMessage, willRetry: shouldRetry
        });

        // Append to error log
        const errorLog = Array.isArray(job.error_log) ? job.error_log : [];
        errorLog.push({ attempt: currentAttempts, error: errorMessage, time: new Date().toISOString() });

        await adminClient
          .from("jobs")
          .update({
            status: newStatus,
            attempts: currentAttempts,
            run_at: runAt || job.run_at,
            error_log: errorLog,
            last_error: errorMessage,
            locked_by: null,
            locked_until: null,
            completed_at: shouldRetry ? null : new Date().toISOString(),
          })
          .eq("id", jobId)
          .eq("workspace_id", job.workspace_id);

        if (jobType === "reyo_pack_amazon_sync" && !shouldRetry) {
          const syncRunId = job.payload && typeof job.payload === "object"
            ? (job.payload as Record<string, unknown>).syncRunId
            : null;
          if (typeof syncRunId === "string") {
            const { error: syncFailureError } = await adminClient.rpc("fail_reyo_pack_sync", {
              p_workspace_id: job.workspace_id,
              p_sync_run_id: syncRunId,
              p_error_code: "JOB_RETRIES_EXHAUSTED",
              p_error_message: errorMessage.slice(0, 1_000),
            });
            if (syncFailureError) {
              log.error("[JobProcessor] Failed to persist terminal Reyo Pack sync state", undefined, {
                jobId,
                syncRunId,
                error: syncFailureError.message,
              });
            }
          }
        }

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

interface ClaimedJob {
  id: string;
  workspace_id?: string;
  attempts: number;
  error_log?: unknown;
}

async function failJob(adminClient: SupabaseClient, job: ClaimedJob, errorMessage: string) {
  const errorLog = Array.isArray(job.error_log) ? job.error_log : [];
  errorLog.push({ attempt: job.attempts + 1, error: errorMessage, time: new Date().toISOString() });
  
  await adminClient
    .from("jobs")
    .update({
      status: "failed",
      attempts: job.attempts + 1,
      error_log: errorLog,
      last_error: errorMessage,
      locked_by: null,
      locked_until: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("workspace_id", job.workspace_id);
}
