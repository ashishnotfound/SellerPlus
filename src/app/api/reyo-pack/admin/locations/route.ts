import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const querySchema = z.object({
  active: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(200),
}).strict();

const saveSchema = z.object({
  locationId: z.string().uuid().nullable().optional(),
  expectedVersion: z.number().int().min(0),
  parentId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  type: z.enum(["WAREHOUSE", "RACK", "SHELF", "BIN"]),
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  sortOrder: z.number().int().min(-100_000).max(100_000).default(0),
  active: z.boolean().default(true),
}).strict();

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.admin");
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    let query = actor.supabaseAdmin
      .from("reyo_pack_locations")
      .select("id, warehouse_id, parent_id, location_type, code, name, sort_order, active, version, created_at, updated_at", { count: "exact" })
      .eq("workspace_id", actor.workspaceId);
    if (input.active !== undefined) query = query.eq("active", input.active);
    const from = (input.page - 1) * input.limit;
    const { data, error, count } = await query
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true })
      .range(from, from + input.limit - 1);
    if (error) throw error;
    return noStoreJson({
      data: data ?? [],
      pagination: { page: input.page, limit: input.limit, total: count ?? 0 },
    });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid location query.");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.admin");
    const input = saveSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("save_reyo_pack_location", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_location_id: input.locationId ?? null,
      p_expected_version: input.expectedVersion,
      p_parent_id: input.parentId ?? null,
      p_warehouse_id: input.warehouseId ?? null,
      p_location_type: input.type,
      p_code: input.code,
      p_name: input.name,
      p_sort_order: input.sortOrder,
      p_active: input.active,
    });
    if (error) throw error;
    return noStoreJson({ data }, { status: input.locationId ? 200 : 201 });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid warehouse location.");
  }
}
