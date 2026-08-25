import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const nullableMoney = z.number().finite().positive().max(1_000_000).nullable();
const nullableTokens = z.number().int().positive().max(10_000_000_000).nullable();
const updateSchema = z.object({
  enabled: z.boolean(),
  expectedVersion: z.number().int().positive().nullable(),
  dailyCostLimitUsd: nullableMoney,
  monthlyCostLimitUsd: nullableMoney,
  dailyTokenLimit: nullableTokens,
  monthlyTokenLimit: nullableTokens,
  requireKnownCost: z.boolean(),
}).strict().refine(
  (value) => !value.enabled || [
    value.dailyCostLimitUsd,
    value.monthlyCostLimitUsd,
    value.dailyTokenLimit,
    value.monthlyTokenLimit,
  ].some((limit) => limit !== null),
  { message: "At least one AI budget limit is required when enforcement is enabled." },
);

function microsToUsd(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value) / 1_000_000;
}

function usdToMicros(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1_000_000);
}

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const { data, error } = await actor.supabaseAdmin
      .from("ai_budget_policies")
      .select("daily_cost_limit_micros, monthly_cost_limit_micros, daily_token_limit, monthly_token_limit, require_known_cost, version, updated_at")
      .eq("workspace_id", actor.workspaceId)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      data: {
        enabled: Boolean(data),
        version: data?.version ?? null,
        dailyCostLimitUsd: microsToUsd(data?.daily_cost_limit_micros),
        monthlyCostLimitUsd: microsToUsd(data?.monthly_cost_limit_micros),
        dailyTokenLimit: data?.daily_token_limit === null || data?.daily_token_limit === undefined
          ? null : Number(data.daily_token_limit),
        monthlyTokenLimit: data?.monthly_token_limit === null || data?.monthly_token_limit === undefined
          ? null : Number(data.monthly_token_limit),
        requireKnownCost: data?.require_known_cost ?? true,
        updatedAt: data?.updated_at ?? null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const input = updateSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("save_workspace_ai_budget_policy", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_expected_version: input.expectedVersion,
      p_enabled: input.enabled,
      p_daily_cost_limit_micros: usdToMicros(input.dailyCostLimitUsd),
      p_monthly_cost_limit_micros: usdToMicros(input.monthlyCostLimitUsd),
      p_daily_token_limit: input.dailyTokenLimit,
      p_monthly_token_limit: input.monthlyTokenLimit,
      p_require_known_cost: input.requireKnownCost,
    });
    if (error) {
      if (error.code === "40001") {
        return NextResponse.json({ error: error.message, code: "VERSION_CONFLICT" }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid AI budget policy.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
