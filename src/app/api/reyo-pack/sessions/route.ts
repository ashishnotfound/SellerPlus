import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { sessionMutationResultSchema } from "@/lib/reyo-pack/contracts";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const startSchema = z.object({
  mode: z.enum(["PACKING", "PUTAWAY"]),
  clientSessionId: z.string().uuid(),
  deviceLabel: z.string().trim().max(160).nullable().optional(),
}).strict();

const listSchema = z.object({
  mode: z.enum(["PACKING", "PUTAWAY"]).optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "ABANDONED"]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    const input = startSchema.parse(await request.json());
    requirePermission(actor, input.mode === "PACKING" ? "reyo_pack.pack" : "reyo_pack.putaway");
    const { data, error } = await actor.supabaseAdmin.rpc("start_reyo_pack_session", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_mode: input.mode,
      p_client_session_id: input.clientSessionId,
      p_device_label: input.deviceLabel ?? null,
    });
    if (error) throw error;
    const result = sessionMutationResultSchema.parse(data);
    return noStoreJson({ data: result }, { status: result.outcome === "STARTED" ? 201 : 200 });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid packing session request.");
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.read");
    const input = listSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    let query = actor.supabaseAdmin
      .from("reyo_pack_sessions")
      .select("id, session_number, mode, status, started_by, ended_by, device_label, packages_packed, units_packed, cancelled_scans, invalid_scans, error_count, putaway_actions, putaway_units, started_at, last_activity_at, ended_at", { count: "exact" })
      .eq("workspace_id", actor.workspaceId);
    if (input.mode) query = query.eq("mode", input.mode);
    if (input.status) query = query.eq("status", input.status);
    const from = (input.page - 1) * input.limit;
    const { data, error, count } = await query
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + input.limit - 1);
    if (error) throw error;
    return noStoreJson({
      data: data ?? [],
      pagination: { page: input.page, limit: input.limit, total: count ?? 0 },
    });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid packing session query.");
  }
}
