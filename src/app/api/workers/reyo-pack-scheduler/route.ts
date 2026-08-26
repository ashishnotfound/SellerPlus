import { NextResponse } from "next/server";
import { authenticateCron, authErrorResponse } from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

export const maxDuration = 30;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { supabaseAdmin } = await authenticateCron(request);
    const { data, error } = await supabaseAdmin.rpc("enqueue_due_reyo_pack_syncs", {
      p_limit: 25,
    });
    if (error) throw error;

    const enqueued = Array.isArray(data) ? data : [];
    log.info("[ReyoPackScheduler] Due Amazon sync jobs enqueued", undefined, {
      count: enqueued.length,
    });
    return NextResponse.json({
      enqueued: enqueued.length,
      syncs: enqueued,
    });
  } catch (error) {
    log.error("[ReyoPackScheduler] Failed to enqueue due Amazon sync jobs", undefined, {
      error: error instanceof Error ? error.message : "Unknown scheduler failure",
    });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
