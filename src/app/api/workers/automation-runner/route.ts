/**
 * SellerPlus OS — Automation Runner Worker
 * 
 * Cron-triggered endpoint that evaluates all enabled automation rules
 * across all active tenants and executes qualifying actions.
 * 
 * Triggered via cron: GET /api/workers/automation-runner?secret=<CRON_SECRET>
 */

import { NextResponse } from "next/server";
import { authenticateCron, authErrorResponse } from "@/lib/auth-middleware";
import { runAutomationCycle, type AutomationContext } from "@/lib/automation-engine";
import { log } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = authenticateCron(request);

    log.info("[AutomationRunner] Starting automation cycle...");

    // Fetch all active (non-suspended) users
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, is_suspended")
      .eq("is_suspended", false);

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ success: true, message: "No active users." });
    }

    const summary: Array<{
      userId: string;
      evaluated: number;
      executed: number;
      pending: number;
    }> = [];

    // Process users in parallel batches of BATCH_SIZE to avoid overwhelming
    // the DB connection pool while still dramatically reducing wall-clock time.
    const BATCH_SIZE = 25;
    for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
      const batch = profiles.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (profile) => {
          const ctx: AutomationContext = {
            userId: profile.id,
            supabase: supabaseAdmin,
          };
          const result = await runAutomationCycle(ctx);
          return { profile, result };
        })
      );

      for (const settled of batchResults) {
        if (settled.status === "fulfilled") {
          const { profile, result } = settled.value;
          if (result.evaluated > 0) {
            summary.push({
              userId: profile.id,
              evaluated: result.evaluated,
              executed: result.executed,
              pending: result.pending,
            });
          }
        } else {
          log.error(`[AutomationRunner] Batch item failed`, undefined, { error: settled.reason });
        }
      }
    }

    const totalEvaluated = summary.reduce((s, r) => s + r.evaluated, 0);
    const totalExecuted = summary.reduce((s, r) => s + r.executed, 0);
    const totalPending = summary.reduce((s, r) => s + r.pending, 0);

    log.info(
      `[AutomationRunner] Cycle complete. Users: ${profiles.length}, Evaluated: ${totalEvaluated}, Executed: ${totalExecuted}, Pending: ${totalPending}`
    );

    return NextResponse.json({
      success: true,
      usersProcessed: profiles.length,
      totalEvaluated,
      totalExecuted,
      totalPending,
      details: summary,
    });
  } catch (error) {
    const { body, status } = authErrorResponse(error);
    if (status !== 500) {
      return NextResponse.json(body, { status });
    }
    log.error("[AutomationRunner] Fatal error:", undefined, { error: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
