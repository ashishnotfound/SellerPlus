import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { putawayLookupResultSchema } from "@/lib/reyo-pack/contracts";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const requestSchema = z.object({
  sessionId: z.string().uuid(),
  barcode: z.string().trim().min(1).max(500),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.putaway");
    const input = requestSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("lookup_reyo_putaway_product", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_session_id: input.sessionId,
      p_barcode: input.barcode,
    });
    if (error) throw error;
    return noStoreJson({ data: putawayLookupResultSchema.parse(data) });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid putaway scan request.");
  }
}
