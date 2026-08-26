import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const querySchema = z.object({
  skuId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.read");
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    let query = actor.supabaseAdmin
      .from("reyo_pack_putaway_events")
      .select("id, sku_id, previous_location_id, new_location_id, event_type, quantity, reason, actor_id, session_id, created_at", { count: "exact" })
      .eq("workspace_id", actor.workspaceId);
    if (input.skuId) query = query.eq("sku_id", input.skuId);
    if (input.sessionId) query = query.eq("session_id", input.sessionId);
    const from = (input.page - 1) * input.limit;
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + input.limit - 1);
    if (error) throw error;
    const rows = data ?? [];
    const skuIds = [...new Set(rows.map((row) => row.sku_id))];
    const locationIds = [...new Set(rows.flatMap((row) => [
      row.previous_location_id,
      row.new_location_id,
    ]).filter((value): value is string => typeof value === "string"))];
    const [{ data: skus, error: skuError }, { data: locations, error: locationError }] =
      await Promise.all([
        skuIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : actor.supabaseAdmin
              .from("reyo_pack_skus")
              .select("id, sku, asin, product_title, size_label")
              .eq("workspace_id", actor.workspaceId)
              .in("id", skuIds),
        locationIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : actor.supabaseAdmin
              .from("reyo_pack_locations")
              .select("id, code, name")
              .eq("workspace_id", actor.workspaceId)
              .in("id", locationIds),
      ]);
    if (skuError || locationError) throw skuError ?? locationError;
    const skuMap = new Map((skus ?? []).map((sku) => [sku.id, sku]));
    const locationMap = new Map((locations ?? []).map((location) => [location.id, location]));
    return noStoreJson({
      data: rows.map((row) => ({
        ...row,
        sku: skuMap.get(row.sku_id) ?? null,
        previous_location: row.previous_location_id
          ? locationMap.get(row.previous_location_id) ?? null
          : null,
        new_location: locationMap.get(row.new_location_id) ?? null,
      })),
      pagination: { page: input.page, limit: input.limit, total: count ?? 0 },
    });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid putaway history query.");
  }
}
