/**
 * GET /api/workers/task-scheduler?secret=<CRON_SECRET>
 *
 * Cron-triggered worker that converts due ai_schedules into bi_jobs.
 * This is the ONLY place that reads ai_schedules — it does NOT execute
 * tasks directly. All execution happens through the existing bi-processor.
 *
 * Execution model:
 *   1. Fetch all active ai_schedules where next_run <= now
 *   2. For each due schedule, enqueue a bi_job via JobService
 *   3. Update ai_schedules.last_run and ai_schedules.next_run
 *   4. Return a summary of what was enqueued
 *
 * Never introduces a parallel execution system.
 * Never skips a schedule without logging why.
 */

import { NextResponse } from "next/server";
import { authenticateCron, authErrorResponse, getAdminClient } from "@/lib/auth-middleware";
import { jobService } from "@/lib/jobs/job-service";
import { getJobEntry } from "@/lib/jobs/job-registry";
import { isSchedulableJobType } from "@/lib/jobs/job-catalog";
import { nextCronRunAfter } from "@/lib/jobs/cron-utils";
import { log } from "@/lib/logger";

export const maxDuration = 30;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await authenticateCron(request);
    const adminClient = getAdminClient();
    // 1. Atomically lease due schedules. Concurrent cron requests skip rows
    // already claimed by another scheduler process.
    const { data: dueSchedules, error: fetchError } = await adminClient
      .rpc("claim_due_ai_schedules", { p_limit: 50 });

    if (fetchError) {
      log.error(`[TaskScheduler] Failed to fetch due schedules: ${fetchError.message}`);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!dueSchedules || dueSchedules.length === 0) {
      return NextResponse.json({ enqueued: 0, message: "No schedules due." });
    }

    const enqueued: string[] = [];
    const skipped: string[] = [];

    for (const schedule of dueSchedules) {
      const {
        schedule_id: scheduleId,
        schedule_user_id: user_id,
        schedule_workspace_id: workspace_id,
        schedule_task_type: task_type,
        schedule_cron: cron_schedule,
        schedule_title: title,
        scheduled_for,
        claim_token,
      } = schedule;

      const pauseInvalid = async (reason: string) => {
        const { error } = await adminClient.rpc("pause_claimed_ai_schedule", {
          p_schedule_id: scheduleId,
          p_claim_token: claim_token,
          p_reason: reason,
        });
        if (error) log.error(`[TaskScheduler] Failed to pause invalid schedule ${scheduleId}: ${error.message}`);
      };

      if (!user_id || !workspace_id || !claim_token) {
        log.error(`[TaskScheduler] Schedule ${scheduleId} has no tenant owner and was not enqueued.`);
        if (claim_token) await pauseInvalid("Schedule has no valid tenant owner.");
        skipped.push(scheduleId);
        continue;
      }

      // 2. Only read-only analysis tasks are accepted by this generic runner.
      const registryEntry = getJobEntry(task_type);
      if (!registryEntry || !isSchedulableJobType(task_type)) {
        log.warn(
          `[TaskScheduler] Skipping schedule "${title}" (id=${scheduleId}): ` +
          `task_type "${task_type}" is not permitted for generic schedules.`
        );
        await pauseInvalid(`Task type "${task_type}" is not permitted for recurring analysis schedules.`);
        skipped.push(scheduleId);
        continue;
      }

      let nextRun: Date;
      try {
        nextRun = nextCronRunAfter(cron_schedule);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Invalid schedule expression.";
        log.warn(`[TaskScheduler] Pausing invalid schedule "${title}" (id=${scheduleId}): ${reason}`);
        await pauseInvalid(reason);
        skipped.push(scheduleId);
        continue;
      }

      try {
        // 3. Enqueue the job through the existing JobService → bi_jobs → bi-processor pipeline
        const result = await jobService.enqueue({
          type: task_type,
          payload: { source: "scheduler", scheduleId, scheduledTitle: title },
          userId: user_id,
          workspaceId: workspace_id,
          priority: registryEntry.priority,
          maxAttempts: registryEntry.retryPolicy.maxAttempts,
          scheduleId,
          idempotencyKey: `schedule:${scheduleId}:${scheduled_for}`,
        });

        // 4. Complete only the lease claimed above. If this write fails, the
        // lease expires and the idempotency key prevents a duplicate job.
        const { data: completed, error: completionError } = await adminClient.rpc(
          "complete_claimed_ai_schedule",
          {
            p_schedule_id: scheduleId,
            p_claim_token: claim_token,
            p_next_run: nextRun.toISOString(),
            p_job_id: result.jobId,
          },
        );
        if (completionError) throw completionError;
        if (completed !== true) throw new Error("Schedule lease expired before completion.");

        log.info(
          `[TaskScheduler] Enqueued job "${task_type}" for schedule "${title}"`,
          undefined,
          { scheduleId, jobId: result.jobId, userId: user_id, nextRun: nextRun.toISOString() }
        );

        enqueued.push(result.jobId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown scheduler error.";
        log.error(
          `[TaskScheduler] Failed to enqueue schedule "${title}" (id=${scheduleId}): ${message}`
        );
        skipped.push(scheduleId);
      }
    }

    return NextResponse.json({
      enqueued: enqueued.length,
      skipped: skipped.length,
      jobIds: enqueued,
    });
  } catch (error) {
    const { body, status } = authErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
