import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { operationalPageSchema, packingStatusSchema } from "@/lib/reyo-pack/contracts";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const querySchema = z.object({
  status: packingStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().superRefine((value, context) => {
  if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
    context.addIssue({ code: "custom", path: ["from"], message: "The start date must precede the end date." });
  }
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.read");
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await actor.supabaseAdmin.rpc("get_reyo_pack_history_page", {
      p_workspace_id: actor.workspaceId,
      p_status: input.status ?? null,
      p_search: input.search || null,
      p_from: input.from ?? null,
      p_to: input.to ?? null,
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
    return reyoPackErrorResponse(error, "Invalid packing history query.");
  }
}
