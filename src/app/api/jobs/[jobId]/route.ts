import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse } from "@/lib/auth-middleware";

const paramsSchema = z.object({ jobId: z.string().uuid() });

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const actor = await authenticate(request);
    const { jobId } = paramsSchema.parse(await context.params);
    const { data, error } = await actor.supabaseAdmin
      .from("jobs")
      .select("id, job_type, status, priority, progress, result, last_error, attempts, max_attempts, created_at, started_at, completed_at, updated_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Job not found.", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid job identifier.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
