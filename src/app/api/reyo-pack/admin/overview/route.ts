import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const overviewSchema = z.object({
  generatedAt: z.string().datetime(),
  windowStart: z.string().datetime(),
  todayOrders: z.coerce.number().int().min(0),
  unpackedOrders: z.coerce.number().int().min(0),
  packedOrders: z.coerce.number().int().min(0),
  cancelledOrders: z.coerce.number().int().min(0),
  currentSessions: z.coerce.number().int().min(0),
  currentPackingSessions: z.coerce.number().int().min(0),
  currentPutawaySessions: z.coerce.number().int().min(0),
  packagesPacked: z.coerce.number().int().min(0),
  unitsPacked: z.coerce.number().int().min(0),
  putawayActions: z.coerce.number().int().min(0),
}).strict();

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.admin");
    const { data, error } = await actor.supabaseAdmin.rpc("get_reyo_pack_admin_overview", {
      p_workspace_id: actor.workspaceId,
    });
    if (error) throw error;
    return noStoreJson({ data: overviewSchema.parse(data) });
  } catch (error) {
    return reyoPackErrorResponse(error, "Unable to load the Reyo Pack overview.");
  }
}
