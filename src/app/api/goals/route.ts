import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { BIRepository } from "@/lib/repositories/bi-repository";

const goalSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  expectedVersion: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).default(""),
  imageUrl: z.union([z.literal(""), z.string().url().max(2_000)]).default(""),
  targetAmount: z.number().finite().positive().max(9_999_999_999.99),
  currentSavings: z.number().finite().min(0),
  deadline: z.string().date().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "dream"]).default("medium"),
  color: z.enum(["indigo", "emerald", "amber", "rose", "sky", "purple"]).default("indigo"),
  category: z.enum(["purchase", "tech", "camera", "vehicle", "home", "travel", "other"]).default("purchase"),
  isCompleted: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.currentSavings > value.targetAmount) context.addIssue({ code: "custom", path: ["currentSavings"], message: "Savings cannot exceed the target." });
  if (value.id && !value.expectedVersion) context.addIssue({ code: "custom", path: ["expectedVersion"], message: "The goal version is required." });
});
const deleteSchema = z.object({ id: z.string().uuid(), expectedVersion: z.coerce.number().int().positive() });

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.read");
    const until = new Date();
    const since = new Date(until.getTime() - 30 * 86_400_000);
    const [goalsResult, summary] = await Promise.all([
      actor.supabaseAdmin.from("goals")
        .select("id, user_id, name, description, image_url, target_amount, current_savings, deadline, priority, is_completed, completed_at, color, category, created_at, updated_at, version")
        .eq("workspace_id", actor.workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200),
      BIRepository.getBusinessSummary(actor.workspaceId, since, until),
    ]);
    const { data, error } = goalsResult;
    if (error) throw error;
    const fees = summary.orders.totalCommissionFees + summary.orders.totalFbaFees + summary.orders.totalShippingCost;
    const planningAvailable = summary.cogs.totalCogs !== null && summary.ads.dataAvailable && summary.orders.totalOrders > 0;
    const verifiedProfit = planningAvailable
      ? summary.orders.totalRevenue - summary.cogs.totalCogs! - fees - summary.ads.totalSpend
      : null;
    const planningContext = {
      available: planningAvailable,
      averageDailyProfit: verifiedProfit === null ? null : verifiedProfit / 30,
      averageProfitPerOrder: verifiedProfit === null ? null : verifiedProfit / summary.orders.totalOrders,
      verifiedProfit,
      dataWindow: summary.dataWindow,
      cogsCoverage: summary.cogs.coverage,
      adsDataAvailable: summary.ads.dataAvailable,
      sourceUpdatedAt: {
        orders: summary.orders.sourceUpdatedAt,
        ads: summary.ads.sourceUpdatedAt,
      },
      limitations: planningAvailable ? [] : [
        ...(summary.orders.totalOrders === 0 ? ["No eligible Amazon orders were recorded in the last 30 days."] : []),
        ...(summary.cogs.totalCogs === null ? [`COGS coverage is ${summary.cogs.coverage.toFixed(1)}%; 100% is required for a profit forecast.`] : []),
        ...(!summary.ads.dataAvailable ? ["Amazon Ads daily facts are unavailable for the planning window."] : []),
      ],
      methodology: "verified_30_day_profit_run_rate_v1",
    };
    return NextResponse.json({ data: data ?? [], planningContext }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.manage");
    const input = goalSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("save_workspace_goal", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_goal_id: input.id ?? null,
      p_expected_version: input.expectedVersion ?? null,
      p_name: input.name,
      p_description: input.description,
      p_image_url: input.imageUrl,
      p_target_amount: input.targetAmount,
      p_current_savings: input.currentSavings,
      p_deadline: input.deadline ?? null,
      p_priority: input.priority,
      p_color: input.color,
      p_category: input.category,
      p_is_completed: input.isCompleted,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "Goal not found." }, { status: 404 });
    if (error?.code === "40001") return NextResponse.json({ error: "The goal changed since it was loaded. Refresh and try again.", code: "VERSION_CONFLICT" }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ data }, { status: input.id ? 200 : 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid goal configuration." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.manage");
    const url = new URL(request.url);
    const input = deleteSchema.parse({ id: url.searchParams.get("id"), expectedVersion: url.searchParams.get("version") });
    const { data, error } = await actor.supabaseAdmin.rpc("delete_workspace_goal", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_goal_id: input.id,
      p_expected_version: input.expectedVersion,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "Goal not found." }, { status: 404 });
    if (error?.code === "40001") return NextResponse.json({ error: "The goal changed since it was loaded. Refresh and try again.", code: "VERSION_CONFLICT" }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid goal." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
