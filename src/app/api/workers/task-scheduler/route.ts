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
import { nextCronRunAfter } from "@/lib/jobs/cron-utils";
import { log } from "@/lib/logger";

export const maxDuration = 30;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    authenticateCron(request);
    const adminClient = getAdminClient();
    const now = new Date().toISOString();

    // 1. Fetch all active schedules whose next_run has arrived
    const { data: dueSchedules, error: fetchError } = await adminClient
      .from("ai_schedules")
      .select("id, user_id, task_type, cron_schedule, title")
      .eq("status", "active")
      .lte("next_run", now)
      .limit(50); // Safety cap — prevents a migration mistake from flooding the queue

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
      const { id: scheduleId, user_id, task_type, cron_schedule, title } = schedule;

      // 2. Validate the task type is registered (prevents orphaned schedules)
      const registryEntry = getJobEntry(task_type);
      if (!registryEntry) {
        log.warn(
          `[TaskScheduler] Skipping schedule "${title}" (id=${scheduleId}): ` +
          `task_type "${task_type}" not found in JobRegistry.`
        );
        skipped.push(scheduleId);
        continue;
      }

      try {
        // 3. Enqueue the job through the existing JobService → bi_jobs → bi-processor pipeline
        const result = await jobService.enqueue({
          type: task_type,
          payload: { source: "scheduler", scheduleId, scheduledTitle: title },
          userId: user_id,
          priority: registryEntry.priority,
          maxAttempts: registryEntry.retryPolicy.maxAttempts,
          scheduleId,
        });

        // 4. Calculate next run time and persist back to ai_schedules
        let nextRun: Date;
        try {
          nextRun = nextCronRunAfter(cron_schedule);
        } catch (cronErr) {
          log.warn(
            `[TaskScheduler] Cannot calculate next run for schedule "${title}" (id=${scheduleId}): ${cronErr}. ` +
            `Scheduling 1 hour from now as fallback.`
          );
          nextRun = new Date(Date.now() + 60 * 60 * 1000);
        }

        await adminClient
          .from("ai_schedules")
          .update({
            last_run: now,
            next_run: nextRun.toISOString(),
          })
          .eq("id", scheduleId);

        log.info(
          `[TaskScheduler] Enqueued job "${task_type}" for schedule "${title}"`,
          undefined,
          { scheduleId, jobId: result.jobId, userId: user_id, nextRun: nextRun.toISOString() }
        );

        enqueued.push(result.jobId);
      } catch (err: any) {
        log.error(
          `[TaskScheduler] Failed to enqueue schedule "${title}" (id=${scheduleId}): ${err.message}`
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
