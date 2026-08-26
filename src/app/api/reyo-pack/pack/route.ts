import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { packResultSchema } from "@/lib/reyo-pack/contracts";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const packSchema = z.object({
  sessionId: z.string().uuid(),
  shipmentId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(200),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.pack");
    const input = packSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("confirm_reyo_pack_shipment", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_session_id: input.sessionId,
      p_shipment_id: input.shipmentId,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    return noStoreJson({ data: packResultSchema.parse(data) });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid packing confirmation request.");
  }
}
