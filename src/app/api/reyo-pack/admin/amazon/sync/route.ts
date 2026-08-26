import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";
import { getAmazonMarketplaceAccount } from "@/lib/amazon/credentials";

const requestSchema = z.object({
  action: z.enum(["SYNC_NOW", "FULL_SYNC", "REFRESH_ORDERS", "SYNC_SHIPPING_DATA"]),
  marketplaceAccountId: z.string().uuid().optional(),
  lastUpdatedAfter: z.string().datetime().optional(),
}).strict();

const actionType = {
  SYNC_NOW: "INCREMENTAL",
  FULL_SYNC: "FULL",
  REFRESH_ORDERS: "ORDERS",
  SYNC_SHIPPING_DATA: "SHIPPING",
} as const;

const enqueueResultSchema = z.object({
  syncRunId: z.string().uuid(),
  jobId: z.string().uuid().nullable(),
  syncType: z.enum(["INCREMENTAL", "FULL", "ORDERS", "SHIPPING"]),
  status: z.enum(["QUEUED", "RUNNING"]),
  reused: z.boolean(),
});

function safeUpdatedAfter(input: {
  requested?: string;
  checkpoint?: string;
  syncType: "INCREMENTAL" | "FULL" | "ORDERS" | "SHIPPING";
}): string {
  const now = Date.now();
  if (input.syncType === "FULL") return new Date(now - 730 * 86_400_000).toISOString();
  const candidate = input.requested ?? input.checkpoint;
  if (candidate) {
    const value = Date.parse(candidate);
    if (Number.isFinite(value) && value >= now - 730 * 86_400_000 && value <= now) {
      return new Date(value).toISOString();
    }
  }
  return new Date(now - 90 * 86_400_000).toISOString();
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.admin");
    const raw = await request.text();
    const input = requestSchema.parse(raw ? JSON.parse(raw) : null);
    const account = await getAmazonMarketplaceAccount(
      actor.supabaseAdmin,
      actor.workspaceId,
      input.marketplaceAccountId,
    );
    if (account.status !== "active" || !account.capabilities.includes("selling_partner")) {
      return NextResponse.json({
        error: "Amazon SP-API is not active for this marketplace account.",
        code: "SP_API_NOT_CONNECTED",
      }, { status: 409 });
    }

    const syncType = actionType[input.action];
    const { data: checkpoint, error: checkpointError } = await actor.supabaseAdmin
      .from("sync_checkpoints")
      .select("cursor")
      .eq("workspace_id", actor.workspaceId)
      .eq("marketplace_account_id", account.id)
      .eq("resource_type", "reyo_pack_amazon_orders")
      .maybeSingle();
    if (checkpointError) throw checkpointError;
    const checkpointCursor = checkpoint?.cursor as { lastUpdatedAfter?: unknown } | undefined;
    const updatedAfter = safeUpdatedAfter({
      requested: input.lastUpdatedAfter,
      checkpoint: typeof checkpointCursor?.lastUpdatedAfter === "string"
        ? checkpointCursor.lastUpdatedAfter
        : undefined,
      syncType,
    });
    const updatedBefore = new Date(Date.now() - 2 * 60_000).toISOString();
    if (Date.parse(updatedAfter) >= Date.parse(updatedBefore)) {
      return NextResponse.json({
        error: "The Amazon synchronization window must end at least two minutes after it begins.",
        code: "INVALID_SYNC_WINDOW",
      }, { status: 400 });
    }

    const correlationId = crypto.randomUUID();
    const { data, error } = await actor.supabaseAdmin.rpc("enqueue_reyo_pack_sync", {
      p_workspace_id: actor.workspaceId,
      p_marketplace_account_id: account.id,
      p_actor_id: actor.userId,
      p_sync_type: syncType,
      p_updated_after: updatedAfter,
      p_updated_before: updatedBefore,
      p_correlation_id: correlationId,
    });
    if (error) throw error;
    const result = enqueueResultSchema.parse(data);
    return NextResponse.json({ data: {
      ...result,
      updatedAfter,
      updatedBefore,
    } }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({
        error: "Invalid Amazon synchronization request.",
        code: "VALIDATION_ERROR",
      }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
