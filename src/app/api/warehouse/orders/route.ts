/**
 * GET /api/warehouse/orders
 *
 * Returns orders pending warehouse action for the authenticated user.
 * Server-side RBAC: only warehouse-permitted roles can access this endpoint.
 * Never relies on client-side route protection alone.
 *
 * Query params:
 *   ?status=pending|packed|all  (default: pending+packed)
 *   ?limit=N                    (default: 50, max: 100)
 */

import { NextResponse } from "next/server";
import {
  authenticateWithDevFallback,
  authErrorResponse,
  AuthError,
  requireRole,
} from "@/lib/auth-middleware";
import { WAREHOUSE_ROLES, WAREHOUSE_VISIBLE_STATUSES } from "@/lib/warehouse/types";
import { log } from "@/lib/logger";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await authenticateWithDevFallback(request);
    requireRole(user, [...WAREHOUSE_ROLES]);

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") ?? "pending";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

    const statuses =
      statusFilter === "all"
        ? [...WAREHOUSE_VISIBLE_STATUSES]
        : statusFilter === "packed"
        ? ["packed", "Packed"]
        : ["pending", "Pending", "Unshipped", "PartiallyShipped"];

    // Fetch orders with their line items via a join
    const { data: orders, error } = await user.supabaseAdmin
      .from("orders")
      .select(`
        id,
        channel_order_id,
        status,
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
          item_price
        )
      `)
      .eq("user_id", user.userId)
      .in("status", statuses)
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

    return NextResponse.json({ orders: orders ?? [] });
  } catch (err) {
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
