import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { operationalPageSchema } from "@/lib/reyo-pack/contracts";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const querySchema = z.object({
  search: z.string().trim().max(200).optional(),
  active: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

const saveSchema = z.object({
  skuId: z.string().uuid().nullable().optional(),
  expectedVersion: z.number().int().min(0),
  marketplaceAccountId: z.string().uuid().nullable().optional(),
  sku: z.string().trim().min(1).max(200),
  asin: z.string().trim().max(20).nullable().optional(),
  productTitle: z.string().trim().max(10_000).nullable().optional(),
  size: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().default(true),
}).strict();

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.admin");
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await actor.supabaseAdmin.rpc("get_reyo_pack_skus_page", {
      p_workspace_id: actor.workspaceId,
      p_search: input.search || null,
      p_active: input.active ?? null,
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
    return reyoPackErrorResponse(error, "Invalid SKU query.");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.admin");
    const input = saveSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("save_reyo_pack_sku", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_sku_id: input.skuId ?? null,
      p_expected_version: input.expectedVersion,
      p_marketplace_account_id: input.marketplaceAccountId ?? null,
      p_sku: input.sku,
      p_asin: input.asin ?? null,
      p_product_title: input.productTitle ?? null,
      p_size_label: input.size ?? null,
      p_active: input.active,
    });
    if (error) throw error;
    return noStoreJson({ data }, { status: input.skuId ? 200 : 201 });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid Reyo Pack SKU.");
  }
}
