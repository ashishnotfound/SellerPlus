import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse } from "@/lib/auth-middleware";

const widgetSchema = z.object({
  id: z.string().trim().min(1).max(100),
  x: z.number().int().min(0).max(20),
  y: z.number().int().min(0).max(100),
  w: z.number().int().min(1).max(4),
  h: z.number().int().min(1).max(8),
}).strict();
const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_widgets"), widgets: z.array(widgetSchema).max(50) }).strict(),
  z.object({ action: z.literal("reset_widgets") }).strict(),
  z.object({ action: z.literal("mark_alerts_read") }).strict(),
]);

const nullableFinite = z.union([z.null(), z.coerce.number().finite()]);
const financialRowsSchema = z.array(z.object({
  date: z.string(),
  revenue: z.coerce.number().finite(),
  ordersCount: z.coerce.number().int().nonnegative(),
  unitsSold: z.coerce.number().int().nonnegative(),
  cogs: nullableFinite,
  cogsCoverage: z.coerce.number().min(0).max(100),
  shippingCost: nullableFinite,
  amazonFees: nullableFinite,
  adSpend: nullableFinite,
  adSales: nullableFinite,
  refundCosts: nullableFinite,
  refundCount: z.union([z.null(), z.coerce.number().int().nonnegative()]),
  contributionProfit: nullableFinite,
  calculationStatus: z.literal("incomplete"),
  sourceUpdatedAt: z.string().nullable(),
  limitations: z.array(z.string()),
}).strict()).max(731);

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    const canViewFinance = actor.permissions.includes("finance.read") || actor.isSuperAdmin;
    const canViewCatalog = actor.permissions.includes("catalog.read") || actor.permissions.includes("inventory.read") || actor.isSuperAdmin;
    const layoutsPromise = actor.supabaseAdmin.from("widget_layouts")
      .select("widget_id, x_pos, y_pos, col_span, row_span")
      .eq("workspace_id", actor.workspaceId)
      .eq("user_id", actor.userId)
      .limit(50);
    const alertsPromise = actor.supabaseAdmin.from("alert_logs")
      .select("id, type, title, message, is_read, created_at")
      .eq("workspace_id", actor.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    const financialPromise = canViewFinance
      ? actor.supabaseAdmin.rpc("get_workspace_financial_daily", {
          p_workspace_id: actor.workspaceId,
          p_since: new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10),
          p_until: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        })
      : Promise.resolve({ data: [], error: null });
    const listingsPromise = canViewCatalog
      ? actor.supabaseAdmin.from("listings")
          .select("sku, asin, title, price, available_qty, incoming_qty, reorder_qty, sales_30d, units_sold_30d, revenue_30d, main_image, marketplace_id, cost_profiles(printing_cost,material_cost,packaging_cost,shipping_cost,labor_cost,misc_cost)", { count: "exact" })
          .eq("workspace_id", actor.workspaceId)
          .eq("status", "active")
          .order("revenue_30d", { ascending: false, nullsFirst: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null, count: 0 });

    const [layoutsResult, alertsResult, financialResult, listingsResult] = await Promise.all([
      layoutsPromise, alertsPromise, financialPromise, listingsPromise,
    ]);
    const error = layoutsResult.error ?? alertsResult.error ?? financialResult.error ?? listingsResult.error;
    if (error) throw error;

    return NextResponse.json({
      data: {
        layouts: layoutsResult.data ?? [],
        alerts: alertsResult.data ?? [],
        financialLogs: financialRowsSchema.parse(financialResult.data ?? []),
        listings: listingsResult.data ?? [],
        catalogTotal: listingsResult.count ?? 0,
        catalogTruncated: Number(listingsResult.count ?? 0) > (listingsResult.data?.length ?? 0),
        permissions: { finance: canViewFinance, catalog: canViewCatalog },
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await authenticate(request);
    const input = updateSchema.parse(await request.json());
    if (input.action === "save_widgets") {
      const rows = input.widgets.map((widget) => ({
        workspace_id: actor.workspaceId,
        user_id: actor.userId,
        widget_id: widget.id,
        col_span: widget.w,
        row_span: widget.h,
        x_pos: widget.x,
        y_pos: widget.y,
      }));
      if (rows.length > 0) {
        const { error } = await actor.supabaseAdmin.from("widget_layouts")
          .upsert(rows, { onConflict: "user_id,widget_id" });
        if (error) throw error;
      }
    } else if (input.action === "reset_widgets") {
      const { error } = await actor.supabaseAdmin.from("widget_layouts")
        .delete().eq("workspace_id", actor.workspaceId).eq("user_id", actor.userId);
      if (error) throw error;
    } else {
      const { error } = await actor.supabaseAdmin.from("alert_logs")
        .update({ is_read: true })
        .eq("workspace_id", actor.workspaceId)
        .eq("is_read", false);
      if (error) throw error;
    }
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid analytics preference update." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
