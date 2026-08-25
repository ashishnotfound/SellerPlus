import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const querySchema = z.object({
  days: z.coerce.number().int().refine((value) => [7, 14, 30].includes(value)).default(30),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50),
});

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "advertising.read");
    const url = new URL(request.url);
    const query = querySchema.parse({
      days: url.searchParams.get("days") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const until = new Date();
    const since = new Date(until);
    since.setUTCDate(since.getUTCDate() - (query.days - 1));
    const { data, error } = await actor.supabaseAdmin.rpc("get_workspace_advertising_overview", {
      p_workspace_id: actor.workspaceId,
      p_since: dateOnly(since),
      p_until: dateOnly(until),
      p_limit: query.limit,
      p_offset: (query.page - 1) * query.limit,
    });
    if (error) throw error;
    return NextResponse.json(
      { data, page: query.page, limit: query.limit },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid advertising query." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
