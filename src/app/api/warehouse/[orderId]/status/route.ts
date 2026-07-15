/**
 * PATCH /api/warehouse/[orderId]/status
 *
 * Updates an order's status (packed | shipped) from the warehouse portal.
 * Server-side RBAC enforced on every request.
 * Writes an immutable audit log entry before any status change.
 * Uses a DB transaction pattern: both the status update and audit log
 * are written in close sequence; partial failure logs a warning without
 * blocking the status change (audit log is non-fatal).
 *
 * Body: { newStatus: "packed" | "shipped", note?: string }
 */

import { NextResponse } from "next/server";
import {
  authenticateWithDevFallback,
  authErrorResponse,
  AuthError,
  requireRole,
} from "@/lib/auth-middleware";
import { appendWarehouseAuditLog } from "@/lib/warehouse/audit-log";
import {
  WAREHOUSE_ROLES,
  ALLOWED_TRANSITIONS,
  StatusUpdateSchema,
} from "@/lib/warehouse/types";
import { log } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orderId } = await params;

  try {
    const user = await authenticateWithDevFallback(request);
    requireRole(user, [...WAREHOUSE_ROLES]);

    // Validate request body
    const rawBody = await request.json().catch(() => null);
    const parsed = StatusUpdateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { newStatus, note } = parsed.data;

    // Fetch current order status (user-scoped to prevent cross-tenant access)
    const { data: order, error: fetchError } = await user.supabaseAdmin
      .from("orders")
      .select("id, status, user_id")
      .eq("id", orderId)
      .eq("user_id", user.userId)
      .maybeSingle();

    if (fetchError || !order) {
      throw new AuthError("Order not found or access denied.", 404);
    }

    // Validate the transition is allowed
    const allowedNext = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowedNext.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status transition: '${order.status}' → '${newStatus}'.`,
          allowed: allowedNext,
        },
        { status: 422 }
      );
    }

    const previousStatus = order.status as string;

    // 1. Append immutable audit log (non-fatal)
    const auditId = await appendWarehouseAuditLog(user.supabaseAdmin, {
      order_id: orderId,
      user_id: user.userId,
      previous_status: previousStatus,
      new_status: newStatus,
      note,
    });

    // 2. Update the order status
    const { error: updateError } = await user.supabaseAdmin
      .from("orders")
      .update({ status: newStatus })
      .eq("id", orderId)
      .eq("user_id", user.userId);

    if (updateError) {
      log.error(`[WarehouseStatus] Status update failed: ${updateError.message}`, undefined, {
        orderId,
        userId: user.userId,
        newStatus,
      });
      throw new AuthError("Failed to update order status.", 500);
    }

    log.info(`[WarehouseStatus] Order ${orderId} updated: ${previousStatus} → ${newStatus}`, undefined, {
      orderId,
      userId: user.userId,
      auditId,
    });

    return NextResponse.json({
      success: true,
      orderId,
      previousStatus,
      newStatus,
      auditId,
    });
  } catch (err) {
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
