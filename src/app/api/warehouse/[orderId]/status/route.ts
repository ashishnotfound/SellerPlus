/**
 * PATCH /api/warehouse/[orderId]/status
 *
 * Updates an order's separate warehouse workflow status (packed | shipped).
 * Server-side RBAC enforced on every request.
 * The transition and both audit records are committed atomically by PostgreSQL.
 * The Amazon source status is never overwritten by warehouse activity.
 *
 * Body: { newStatus: "packed" | "shipped", note?: string }
 */

import { NextResponse } from "next/server";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";
import {
  StatusUpdateSchema,
} from "@/lib/warehouse/types";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orderId } = await params;

  try {
    const user = await authenticate(request);
    requirePermission(user, "order.manage");
    const validatedOrderId = z.string().uuid().parse(orderId);

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

    const { data, error } = await user.supabaseAdmin.rpc("transition_warehouse_order", {
      p_workspace_id: user.workspaceId,
      p_order_id: validatedOrderId,
      p_actor_id: user.userId,
      p_new_status: newStatus,
      p_note: note ?? null,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "Order not found or access denied." }, { status: 404 });
    if (error?.code === "22023") return NextResponse.json({ error: error.message }, { status: 422 });
    if (error) throw error;
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
