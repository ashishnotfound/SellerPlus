import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const querySchema = z.object({
  days: z.coerce.number().int().refine((value) => [30, 90, 365].includes(value)).default(90),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50),
});

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.read");
    const url = new URL(request.url);
    const query = querySchema.parse({
      days: url.searchParams.get("days") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const until = new Date();
    const since = new Date(until.getTime() - query.days * 86_400_000);
    const { data, error } = await actor.supabaseAdmin.rpc("get_workspace_refunds_overview", {
      p_workspace_id: actor.workspaceId,
      p_since: since.toISOString(),
      p_until: until.toISOString(),
      p_limit: query.limit,
      p_offset: (query.page - 1) * query.limit,
    });
    if (error) throw error;
    return NextResponse.json({ data, page: query.page, limit: query.limit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid refunds query." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
