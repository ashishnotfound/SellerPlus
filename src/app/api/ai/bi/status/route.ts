/**
 * GET /api/ai/bi/status?jobId=<uuid>
 *
 * Polls the status of an async BI analysis job.
 * Returns the job result when status is 'completed'.
 */

import { NextResponse } from "next/server";
import { authenticateWithDevFallback } from "@/lib/auth-middleware";
import { getAdminClient } from "@/lib/auth-middleware";

export async function GET(req: Request) {
  try {
    const user = await authenticateWithDevFallback(req);
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "jobId query parameter is required." }, { status: 400 });
    }

    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from("jobs")
      .select("id, status, result, last_error, created_at, started_at, completed_at")
      .eq("id", jobId)
      .eq("workspace_id", user.workspaceId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json({
      jobId: data.id,
      status: data.status,
      result: data.result ?? null,
      error: data.last_error ?? null,
      createdAt: data.created_at,
      startedAt: data.started_at,
      completedAt: data.completed_at,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
