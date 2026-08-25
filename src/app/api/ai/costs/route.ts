import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const summarySchema = z.object({
  totalCostMicros: z.coerce.number().nonnegative(),
  totalInputTokens: z.coerce.number().int().nonnegative(),
  totalOutputTokens: z.coerce.number().int().nonnegative(),
  totalRequests: z.coerce.number().int().nonnegative(),
  failedRequests: z.coerce.number().int().nonnegative(),
  byProvider: z.array(z.object({
    provider: z.string(),
    model: z.string(),
    costMicros: z.coerce.number().nonnegative(),
    inputTokens: z.coerce.number().int().nonnegative(),
    outputTokens: z.coerce.number().int().nonnegative(),
    requests: z.coerce.number().int().nonnegative(),
  })),
  byFeature: z.array(z.object({
    feature: z.string(),
    costMicros: z.coerce.number().nonnegative(),
    requests: z.coerce.number().int().nonnegative(),
  })),
});

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.read");
    const url = new URL(request.url);
    const { days } = querySchema.parse({ days: url.searchParams.get("days") ?? undefined });
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data, error } = await actor.supabaseAdmin.rpc("get_workspace_ai_usage_summary", {
      p_workspace_id: actor.workspaceId,
      p_since: since,
    });
    if (error) throw error;
    const summary = summarySchema.parse(data);

    return NextResponse.json({
      data: {
        ...summary,
        totalCostUsd: summary.totalCostMicros / 1_000_000,
        periodDays: days,
        source: "recorded_provider_usage",
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid AI usage request or stored usage record.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
