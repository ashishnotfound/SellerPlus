import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";
import { getAmazonMarketplaceAccount } from "@/lib/amazon/credentials";
import { jobService } from "@/lib/jobs/job-service";

const requestSchema = z.object({
  marketplaceAccountId: z.string().uuid().optional(),
  lastUpdatedAfter: z.string().datetime().optional(),
  fullRebuild: z.boolean().default(false),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "order.manage");
    const raw = await request.text();
    const input = requestSchema.parse(raw ? JSON.parse(raw) : {});
    const account = await getAmazonMarketplaceAccount(
      actor.supabaseAdmin,
      actor.workspaceId,
      input.marketplaceAccountId,
    );
    if (!account.capabilities.includes("selling_partner")) {
      return NextResponse.json({ error: "Amazon SP-API is not connected for this account.", code: "SP_API_NOT_CONNECTED" }, { status: 409 });
    }

    let updatedAfter = input.lastUpdatedAfter;
    if (!updatedAfter) {
      const { data: checkpoint } = await actor.supabaseAdmin
        .from("sync_checkpoints")
        .select("cursor, last_succeeded_at")
        .eq("workspace_id", actor.workspaceId)
        .eq("marketplace_account_id", account.id)
        .eq("resource_type", "amazon_orders_inventory")
        .maybeSingle();
      const cursor = checkpoint?.cursor as { lastUpdatedAfter?: unknown } | undefined;
      updatedAfter = typeof cursor?.lastUpdatedAfter === "string"
        ? cursor.lastUpdatedAfter
        : checkpoint?.last_succeeded_at ?? undefined;
    }
    if (input.fullRebuild) {
      updatedAfter = new Date(Date.now() - 365 * 86_400_000).toISOString();
    } else if (!updatedAfter) {
      updatedAfter = new Date(Date.now() - 90 * 86_400_000).toISOString();
    }
    const oldestAllowed = Date.now() - 366 * 86_400_000;
    if (Date.parse(updatedAfter) < oldestAllowed || Date.parse(updatedAfter) > Date.now()) {
      return NextResponse.json({ error: "Order sync boundary must be within the past year.", code: "INVALID_SYNC_BOUNDARY" }, { status: 400 });
    }

    const fiveMinuteWindow = Math.floor(Date.now() / 300_000);
    const result = await jobService.enqueue({
      type: "amazon_orders_sync",
      payload: {
        marketplaceAccountId: account.id,
        updatedAfter,
        phase: "orders",
        pendingOrders: [],
        imported: 0,
        inventoryImported: 0,
        pageCount: 0,
      },
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      priority: 1,
      maxAttempts: 8,
      idempotencyKey: `amazon_orders_sync:${account.id}:${fiveMinuteWindow}`,
      resourceKey: `marketplace-account:${account.id}:amazon-orders-sync`,
    });
    const now = new Date().toISOString();
    await actor.supabaseAdmin.from("sync_checkpoints").upsert({
      workspace_id: actor.workspaceId,
      marketplace_account_id: account.id,
      resource_type: "amazon_orders_inventory",
      cursor: { lastUpdatedAfter: updatedAfter },
      last_attempted_at: now,
      freshness_state: "syncing",
      updated_at: now,
    }, { onConflict: "workspace_id,marketplace_account_id,resource_type" });

    return NextResponse.json({
      data: { jobId: result.jobId, status: result.status, updatedAfter },
    }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid orders sync request.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
