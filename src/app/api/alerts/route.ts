import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const scanSchema = z.object({ lowStockThreshold: z.number().int().min(1).max(100_000).default(10) }).strict();
const resolveSchema = z.object({ alertId: z.string().uuid() }).strict();

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "inventory.read");
    const [{ data: alerts, error }, { data: connections, error: connectionError }] = await Promise.all([
      actor.supabaseAdmin.from("listing_alerts")
        .select("id, sku, asin, alert_type, severity, reason, recommended_action, resolved, data_source, source_updated_at, created_at")
        .eq("workspace_id", actor.workspaceId)
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(200),
      actor.supabaseAdmin.from("marketplace_accounts")
        .select("id, provider, marketplace_name, marketplace_id, status, capabilities, updated_at")
        .eq("workspace_id", actor.workspaceId)
        .order("updated_at", { ascending: false }),
    ]);
    if (error || connectionError) throw error ?? connectionError;
    return NextResponse.json({ data: alerts ?? [], connections: connections ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "inventory.manage");
    const raw = await request.text();
    const input = scanSchema.parse(raw ? JSON.parse(raw) : {});
    const { data, error } = await actor.supabaseAdmin.rpc("scan_workspace_listing_alerts", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_low_stock_threshold: input.lowStockThreshold,
    });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid diagnostic configuration." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "inventory.manage");
    const input = resolveSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.rpc("resolve_workspace_listing_alert", {
      p_workspace_id: actor.workspaceId,
      p_alert_id: input.alertId,
      p_actor_id: actor.userId,
    });
    if (error?.code === "P0002") return NextResponse.json({ error: "Alert not found." }, { status: 404 });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid alert." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
