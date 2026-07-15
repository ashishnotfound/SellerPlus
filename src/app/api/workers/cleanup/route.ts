/**
 * SellerPlus OS — System Database Cleanup Worker Route
 * 
 * Scheduled cleanup task that prunes logs and expired caches to ensure
 * bounded database growth. Run daily via cron or external schedulers.
 */

import { NextResponse } from "next/server";
import { authenticateCron, authErrorResponse, getAdminClient } from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

export async function POST(request: Request) {
  const correlationId = "cleanup-" + Date.now();
  
  try {
    authenticateCron(request);
    log.info("Starting database log and cache pruning task...", correlationId);
    const adminClient = getAdminClient();

    // 1. Prune system logs older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { count: logsPruned, error: logsError } = await adminClient
      .from("system_logs")
      .delete({ count: "exact" })
      .lt("created_at", sevenDaysAgo.toISOString());

    if (logsError) throw logsError;

    // 2. Prune expired cache records
    const { count: cachesPruned, error: cachesError } = await adminClient
      .from("ai_response_cache")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString());

    if (cachesError) throw cachesError;

    log.info(
      `Database cleanup completed successfully. Pruned ${logsPruned || 0} logs and ${cachesPruned || 0} caches.`,
      correlationId
    );

    return NextResponse.json({
      success: true,
      logsPruned: logsPruned || 0,
      cachesPruned: cachesPruned || 0
    });
  } catch (err: any) {
    const authErr = authErrorResponse(err);
    if (err?.name === "AuthError") {
      return NextResponse.json({ error: authErr.body.error }, { status: authErr.status });
    }
    log.error(`Database cleanup worker failed: ${err.message}`, correlationId, err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
