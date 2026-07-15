/**
 * SellerPlus OS — Centralized Heartbeat Monitor
 * 
 * Tracks background worker execution status, rolling average runtimes,
 * recovery times, failure logs, and overall health status.
 */

import { getAdminClient } from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

export async function reportHeartbeat(
  workerName: string,
  durationMs: number,
  success: boolean,
  correlationId?: string
): Promise<void> {
  try {
    const adminClient = getAdminClient();
    const now = new Date();

    // 1. Fetch current status to update rolling averages and consecutive failures
    const { data: current, error } = await adminClient
      .from("heartbeats")
      .select("*")
      .eq("worker_name", workerName)
      .maybeSingle();

    let consecutiveFailures = current?.consecutive_failures || 0;
    let avgDuration = current?.avg_duration_ms || 0;
    let maxDuration = current?.max_duration_ms || 0;
    let lastSuccessAt = current?.last_success_at ? new Date(current.last_success_at) : null;
    let lastFailureAt = current?.last_failure_at ? new Date(current.last_failure_at) : null;
    let recoveryTimeMs = current?.recovery_time_ms || 0;
    let healthStatus = current?.health_status || "healthy";

    // Update rolling average duration
    if (avgDuration === 0) {
      avgDuration = durationMs;
    } else {
      avgDuration = Math.round((avgDuration * 4 + durationMs) / 5); // 5-sample moving average
    }

    // Update max duration
    if (durationMs > maxDuration) {
      maxDuration = durationMs;
    }

    if (success) {
      // Calculate recovery time if transitioning from unhealthy/degraded
      if (healthStatus !== "healthy" && lastFailureAt) {
        recoveryTimeMs = now.getTime() - lastFailureAt.getTime();
        log.info(`[Heartbeat] Worker ${workerName} recovered. Recovery time: ${recoveryTimeMs}ms`, correlationId);
      }
      consecutiveFailures = 0;
      lastSuccessAt = now;
      healthStatus = "healthy";
    } else {
      consecutiveFailures += 1;
      lastFailureAt = now;
      healthStatus = consecutiveFailures >= 3 ? "unhealthy" : "degraded";
      
      log.warn(
        `[Heartbeat] Worker ${workerName} reported failure. Consecutive failures: ${consecutiveFailures}`,
        correlationId
      );
    }

    await adminClient
      .from("heartbeats")
      .upsert({
        worker_name: workerName,
        last_run_at: now.toISOString(),
        last_success_at: lastSuccessAt ? lastSuccessAt.toISOString() : null,
        last_failure_at: lastFailureAt ? lastFailureAt.toISOString() : null,
        consecutive_failures: consecutiveFailures,
        avg_duration_ms: avgDuration,
        max_duration_ms: maxDuration,
        recovery_time_ms: recoveryTimeMs,
        health_status: healthStatus,
        updated_at: now.toISOString()
      });

  } catch (err: any) {
    log.error(`[Heartbeat] Failed to report heartbeat for ${workerName}: ${err.message}`, correlationId, err);
  }
}
