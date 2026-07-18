/**
 * SellerPlus OS — Provider-Agnostic Job Service
 *
 * A minimal abstraction for background job processing.
 * The concrete implementation is Supabase Postgres (zero infra).
 * If a queue provider is needed in future (Inngest, BullMQ, etc.),
 * only the concrete class changes — all callers stay the same.
 */

import { getAdminClient } from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

// ─── Shared Types ─────────────────────────────────────────────────────

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface EnqueuedJob<T = Record<string, unknown>> {
  /** Job type identifier — must match a JobRegistry key */
  type: string;
  /** Serializable job payload */
  payload: T;
  /** The user this job belongs to */
  userId?: string;
  /** The workspace this job belongs to */
  workspaceId?: string;
  /** Lower number = processed first. Default 5. */
  priority?: number;
  /** Override default max retry attempts. Default 3. */
  maxAttempts?: number;
  /** Optional reference to the ai_schedule that triggered this job */
  scheduleId?: string;
}

export interface JobResult {
  jobId: string;
  status: JobStatus;
}

// ─── Abstract Contract ────────────────────────────────────────────────

export interface JobService {
  enqueue<T>(job: EnqueuedJob<T>): Promise<JobResult>;
  getStatus(jobId: string): Promise<JobStatus | null>;
}

// ─── Supabase Postgres Implementation ────────────────────────────────

export class SupabaseJobService implements JobService {
  /**
   * Inserts a new job record into the bi_jobs queue table.
   * Returns immediately with the job ID — does not wait for execution.
   */
  async enqueue<T>(job: EnqueuedJob<T>): Promise<JobResult> {
    const adminClient = getAdminClient();

    const { data, error } = await adminClient
      .from("jobs")
      .insert({
        user_id: job.userId,
        workspace_id: job.workspaceId,
        job_type: job.type,
        payload: {
          ...(job.payload as Record<string, unknown>),
          // Preserve schedule linkage in payload for observability
          ...(job.scheduleId ? { _scheduleId: job.scheduleId } : {}),
        },
        priority: job.priority ?? 5,
        max_attempts: job.maxAttempts ?? 3,
        status: "pending", // Unified queue uses 'pending' instead of 'queued'
        schedule_id: job.scheduleId,
      })
      .select("id")
      .single();

    if (error || !data) {
      log.error(`[JobService] Failed to enqueue job type=${job.type}: ${error?.message}`);
      throw new Error(`Failed to enqueue job: ${error?.message}`);
    }

    log.info(`[JobService] Enqueued job type=${job.type} id=${data.id}`, undefined, {
      jobId: data.id,
      userId: job.userId,
      type: job.type,
    });

    return { jobId: data.id, status: "pending" };
  }

  /**
   * Fetches the current status of a job by ID.
   */
  async getStatus(jobId: string): Promise<JobStatus | null> {
    const adminClient = getAdminClient();

    const { data } = await adminClient
      .from("jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();

    return (data?.status as JobStatus) ?? null;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────

/** Shared job service instance. Swap implementation here for future providers. */
export const jobService: JobService = new SupabaseJobService();
