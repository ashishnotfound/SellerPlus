import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";

const querySchema = z.object({
  status: z.enum([
    "proposed",
    "approval_required",
    "approved",
    "rejected",
    "executing",
    "executed",
    "failed",
    "expired",
    "canceled",
  ]).default("approval_required"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "automation.read");
    const url = new URL(request.url);
    const query = querySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const { data, error } = await actor.supabaseAdmin
      .from("action_proposals")
      .select([
        "id",
        "action_type",
        "resource_type",
        "resource_id",
        "marketplace_account_id",
        "current_state",
        "proposed_state",
        "reasoning",
        "confidence",
        "expected_impact",
        "risk_level",
        "status",
        "policy_snapshot",
        "expires_at",
        "created_at",
        "updated_at",
        "version",
      ].join(","))
      .eq("workspace_id", actor.workspaceId)
      .eq("status", query.status)
      .order("created_at", { ascending: false })
      .limit(query.limit);

    if (error) throw error;
    return NextResponse.json(
      { data: data ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid proposal query.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
