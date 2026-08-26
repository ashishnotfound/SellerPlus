import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const paramsSchema = z.object({ skuId: z.string().uuid() });
const bodySchema = z.object({
  barcodes: z.array(z.object({
    barcode: z.string().trim().min(1).max(200),
    barcodeType: z.enum(["EAN_8", "EAN_13", "UPC_A", "UPC_E", "CODE_39", "CODE_128", "ITF", "OTHER"]),
  }).strict()).max(50),
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
    const { data, error } = await actor.supabaseAdmin.rpc("replace_reyo_pack_sku_barcodes", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_sku_id: skuId,
      p_barcodes: input.barcodes,
    });
    if (error) throw error;
    return noStoreJson({ data });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid product barcode configuration.");
  }
}
