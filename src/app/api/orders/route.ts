import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().max(50).optional(),
  marketplace: z.string().trim().max(30).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  sort: z.enum(["purchase_date", "total_amount"]).default("purchase_date"),
  ascending: z.enum(["true", "false"]).transform((value) => value === "true").default("false"),
}).strict();

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "order.read");
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const end = input.end ? new Date(input.end) : new Date();
    const start = input.start ? new Date(input.start) : new Date(end.getTime() - 30 * 86_400_000);
    if (start > end) return NextResponse.json({ error: "Start date must be before end date." }, { status: 400 });
    if (end.getTime() - start.getTime() > 10 * 365 * 86_400_000) {
      return NextResponse.json({ error: "Order analytics date range is too large." }, { status: 400 });
    }

    const [{ data: pageResult, error: pageError }, { data: analytics, error: analyticsError }, { data: checkpoint, error: checkpointError }] = await Promise.all([
      actor.supabaseAdmin.rpc("get_workspace_orders_page", {
        p_workspace_id: actor.workspaceId,
        p_limit: input.pageSize,
        p_offset: (input.page - 1) * input.pageSize,
        p_search: input.search || null,
        p_status: input.status || null,
        p_marketplace: input.marketplace || null,
        p_start: start.toISOString(),
        p_end: end.toISOString(),
        p_sort: input.sort,
        p_ascending: input.ascending,
      }),
      actor.supabaseAdmin.rpc("get_workspace_order_analytics", {
        p_workspace_id: actor.workspaceId,
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      }),
      actor.supabaseAdmin.from("sync_checkpoints")
        .select("last_succeeded_at, last_attempted_at, freshness_state, failure_count")
        .eq("workspace_id", actor.workspaceId)
        .eq("resource_type", "amazon_orders_inventory")
        .order("last_succeeded_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (pageError || analyticsError || checkpointError) throw pageError ?? analyticsError ?? checkpointError;

    const pageDocument = (pageResult ?? {}) as { rows?: Array<Record<string, unknown>>; total?: number };
    const orders = Array.isArray(pageDocument.rows) ? pageDocument.rows : [];
    const orderIds = orders.map((order) => String(order.id));
    const { data: items, error: itemsError } = orderIds.length === 0
      ? { data: [], error: null }
      : await actor.supabaseAdmin.from("order_items")
          .select("id, order_id, seller_sku, asin, title, quantity_ordered, quantity_shipped, item_price, listing_id, listing:listings(id,title,main_image,price,asin,sku,brand,cost_profile_id)")
          .eq("workspace_id", actor.workspaceId)
          .in("order_id", orderIds)
          .limit(Math.min(5_000, orderIds.length * 50));
    if (itemsError) throw itemsError;

    const orderMap = new Map(orders.map((order) => [String(order.id), order]));
    const enrichedItems = (items ?? []).map((item: Record<string, unknown>) => {
      const parent = orderMap.get(String(item.order_id));
      return {
        ...item,
        channel_order_id: parent?.channel_order_id ?? "—",
        status: parent?.status ?? "—",
        purchase_date: parent?.purchase_date ?? null,
        fulfillment_channel: parent?.fulfillment_channel ?? null,
        marketplace_id: parent?.marketplace_id ?? null,
        cogs: null,
        profit: null,
        margin: null,
      };
    });

    return NextResponse.json({
      data: orders,
      items: enrichedItems,
      analytics: analytics ?? {},
      freshness: checkpoint ?? null,
      pagination: { page: input.page, pageSize: input.pageSize, total: Number(pageDocument.total ?? 0) },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid order query." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
