/**
 * GET /api/warehouse/orders
 *
 * Returns orders pending warehouse action for the authenticated workspace.
 * Server-side RBAC: only warehouse-permitted roles can access this endpoint.
 * Never relies on client-side route protection alone.
 *
 * Query params:
 *   ?status=pending|packed|all  (default: pending+packed)
 *   ?limit=N                    (default: 50, max: 100)
 */

import { NextResponse } from "next/server";
import {
  authenticate,
  authErrorResponse,
  AuthError,
  requirePermission,
} from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await authenticate(request);
    requirePermission(user, "order.read");

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") ?? "pending";
    const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;

    const statuses =
      statusFilter === "all"
        ? ["pending", "packed"]
        : statusFilter === "packed"
        ? ["packed"]
        : ["pending"];

    // Fetch orders with their line items via a join
    const { data: orders, error } = await user.supabaseAdmin
      .from("orders")
      .select(`
        id,
        channel_order_id,
        warehouse_status,
        customer_name,
        shipping_address,
        shipping_method,
        packing_notes,
        fulfillment_channel,
        purchase_date,
        order_items (
          id,
          seller_sku,
          asin,
          title,
          quantity_ordered,
          quantity_shipped,
          item_price,
          listing:listings(main_image)
        )
      `)
      .eq("workspace_id", user.workspaceId)
      .in("warehouse_status", statuses)
      .order("purchase_date", { ascending: false })
      .limit(limit);

    if (error) {
      log.error(`[WarehouseOrders] DB error: ${error.message}`, undefined, { userId: user.userId });
      throw new AuthError("Failed to fetch warehouse orders.", 500);
    }

    log.info(`[WarehouseOrders] Returned ${(orders ?? []).length} orders`, undefined, {
      userId: user.userId,
      statusFilter,
    });

    const mappedOrders = (orders ?? []).map((order: Record<string, any>) => ({
      id: order.id,
      channel_order_id: order.channel_order_id,
      status: order.warehouse_status,
      customer_name: order.customer_name,
      shipping_address: order.shipping_address,
      shipping_method: order.shipping_method,
      packing_notes: order.packing_notes,
      fulfillment_channel: order.fulfillment_channel,
      purchase_date: order.purchase_date,
      items: (order.order_items ?? []).map((item: Record<string, any>) => {
        const listing = Array.isArray(item.listing) ? item.listing[0] : item.listing;
        return { ...item, main_image: listing?.main_image ?? null, listing: undefined };
      }),
    }));
    return NextResponse.json({ orders: mappedOrders }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
