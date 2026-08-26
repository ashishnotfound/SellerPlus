import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const paramsSchema = z.object({ skuId: z.string().uuid() });
const bodySchema = z.object({
  locationId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  expectedQuantity: z.number().int().min(0).nullable().optional(),
  reason: z.string().trim().max(500).default(""),
  idempotencyKey: z.string().min(8).max(200),
}).strict();

export async function PUT(
  request: Request,
  context: { params: Promise<{ skuId: string }> },
): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.admin");
    const { skuId } = paramsSchema.parse(await context.params);
    const input = bodySchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("set_reyo_pack_sku_location", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_sku_id: skuId,
      p_location_id: input.locationId,
      p_expected_version: input.expectedVersion,
      p_quantity: input.expectedQuantity ?? null,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    return noStoreJson({ data });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid SKU location assignment.");
  }
}
