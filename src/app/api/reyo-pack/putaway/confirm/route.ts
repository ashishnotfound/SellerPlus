import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { putawayConfirmResultSchema } from "@/lib/reyo-pack/contracts";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const requestSchema = z.object({
  sessionId: z.string().uuid(),
  skuId: z.string().uuid(),
  expectedLocationId: z.string().uuid(),
  expectedAssignmentVersion: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100_000).default(1),
  reason: z.string().trim().max(500).default(""),
  idempotencyKey: z.string().min(8).max(200),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.putaway");
    const input = requestSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("confirm_reyo_putaway_sku", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_session_id: input.sessionId,
      p_sku_id: input.skuId,
      p_expected_location_id: input.expectedLocationId,
      p_expected_assignment_version: input.expectedAssignmentVersion,
      p_quantity: input.quantity,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    return noStoreJson({ data: putawayConfirmResultSchema.parse(data) });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid putaway confirmation request.");
  }
}
