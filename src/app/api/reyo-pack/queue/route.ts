import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { operationalPageSchema, packingStatusSchema } from "@/lib/reyo-pack/contracts";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const querySchema = z.object({
  status: packingStatusSchema.default("UNPACKED"),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(["ship_by", "order_date", "sku", "product", "quantity", "priority"]).default("ship_by"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.read");
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await actor.supabaseAdmin.rpc("get_reyo_pack_queue_page", {
      p_workspace_id: actor.workspaceId,
      p_status: input.status,
      p_search: input.search || null,
      p_sort: input.sort,
      p_ascending: input.direction === "asc",
      p_limit: input.limit,
      p_offset: (input.page - 1) * input.limit,
    });
    if (error) throw error;
    const page = operationalPageSchema.parse(data);
    return noStoreJson({
      data: page.rows,
      pagination: { page: input.page, limit: input.limit, total: page.total },
    });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid packing queue query.");
  }
}
