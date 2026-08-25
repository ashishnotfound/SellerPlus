import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const scopeTypes = ["workspace", "brand", "marketplace", "product", "workflow"] as const;
const createSchema = z.object({
  scopeType: z.enum(scopeTypes).default("workspace"),
  scopeId: z.string().trim().min(1).max(200).nullable().optional(),
  memoryKey: z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9_.-]*$/i),
  value: z.unknown()
    .refine((value) => value !== undefined && value !== null, "A memory value is required.")
    .refine((value) => {
      const encoded = JSON.stringify(value);
      return typeof encoded === "string" && encoded.length <= 32_000;
    }, "Memory value is too large."),
}).strict();
const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "automation.read");
    const { data, error } = await actor.supabaseAdmin
      .from("ai_memories")
      .select("id, scope_type, scope_id, memory_key, value, source, version, created_by, created_at, updated_at")
      .eq("workspace_id", actor.workspaceId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const input = createSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("upsert_workspace_ai_memory", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_scope_type: input.scopeType,
      p_scope_id: input.scopeId ?? null,
      p_memory_key: input.memoryKey,
      p_value: input.value,
    });
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid memory configuration." }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const url = new URL(request.url);
    const input = deleteSchema.parse({ id: url.searchParams.get("id") });
    const { data, error } = await actor.supabaseAdmin.rpc("deactivate_workspace_ai_memory", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_memory_id: input.id,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid memory." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
