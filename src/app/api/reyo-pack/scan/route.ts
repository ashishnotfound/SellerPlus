import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { scanResultSchema } from "@/lib/reyo-pack/contracts";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const scanSchema = z.object({
  sessionId: z.string().uuid(),
  barcode: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().min(8).max(200),
  marketplaceAccountId: z.string().uuid().nullable().optional(),
  source: z.enum(["CAMERA", "MANUAL", "HARDWARE"]).default("CAMERA"),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.pack");
    const input = scanSchema.parse(await request.json());
    if (input.source === "MANUAL") {
      const { data: setting, error: settingError } = await actor.supabaseAdmin
        .from("reyo_pack_settings")
        .select("allow_manual_awb")
        .eq("workspace_id", actor.workspaceId)
        .maybeSingle();
      if (settingError) throw settingError;
      if (setting?.allow_manual_awb === false) {
        return NextResponse.json({
          error: "Manual AWB entry is disabled for this workspace.",
          code: "MANUAL_SCAN_DISABLED",
        }, { status: 403 });
      }
    }
    const { data, error } = await actor.supabaseAdmin.rpc("claim_reyo_pack_shipment", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_session_id: input.sessionId,
      p_barcode: input.barcode,
      p_idempotency_key: input.idempotencyKey,
      p_marketplace_account_id: input.marketplaceAccountId ?? null,
    });
    if (error) throw error;
    return noStoreJson({ data: scanResultSchema.parse(data) });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid barcode scan request.");
  }
}
