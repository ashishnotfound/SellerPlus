/**
 * GET /api/ai/bi/status?jobId=<uuid>
 *
 * Polls the status of an async BI analysis job.
 * Returns the job result when status is 'completed'.
 */

import { NextResponse } from "next/server";
import { authenticate, authErrorResponse } from "@/lib/auth-middleware";
import { publicJobError } from "@/lib/jobs/public-error";
import { z } from "zod";

export async function GET(req: Request) {
  try {
    const user = await authenticate(req);
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "jobId query parameter is required." }, { status: 400 });
    }

    const { data, error } = await user.supabaseAdmin
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
      error: publicJobError(data.status, data.last_error),
      createdAt: data.created_at,
      startedAt: data.started_at,
      completedAt: data.completed_at,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid job identifier.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
