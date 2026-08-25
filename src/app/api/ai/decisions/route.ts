import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "automation.read");
    const url = new URL(request.url);
    const query = querySchema.parse({ limit: url.searchParams.get("limit") ?? undefined });
    const { data, error } = await actor.supabaseAdmin
      .from("ai_recommendation_history")
      .select([
        "id",
        "recommendation",
        "ai_reasoning",
        "confidence",
        "confidence_reason",
        "evidence",
        "source_tables",
        "source_kpis",
        "simulation",
        "risk_level",
        "lifecycle",
        "status",
        "resolved_at",
        "created_at",
        "updated_at",
      ].join(","))
      .eq("workspace_id", actor.workspaceId)
      .order("created_at", { ascending: false })
      .limit(query.limit);
    if (error) throw error;
    return NextResponse.json(
      {
        data: data ?? [],
        outcomeMeasurement: "not_implemented",
        notice: "Recommendation outcomes are not measured automatically yet.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid decision query." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
