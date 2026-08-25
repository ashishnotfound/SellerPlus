import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const updateSchema = z.object({
  notes: z.string().trim().max(5_000),
  expectedVersion: z.number().int().positive(),
}).strict();

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "order.manage");
    const { orderId } = await params;
    const id = z.string().uuid().parse(orderId);
    const input = updateSchema.parse(await request.json());
    const { data: updated, error } = await actor.supabaseAdmin.rpc("update_workspace_order_notes", {
      p_workspace_id: actor.workspaceId,
      p_order_id: id,
      p_actor_id: actor.userId,
      p_expected_version: input.expectedVersion,
      p_notes: input.notes,
    });
    if (error?.code === "40001") return NextResponse.json({ error: "The order changed. Refresh before saving notes.", code: "VERSION_CONFLICT" }, { status: 409 });
    if (error?.code === "P0002") return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (error) throw error;
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid order note update." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
