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
  daysBack: z.number().int().min(1).max(365).default(90),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.read");
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
    const postedBefore = new Date().toISOString();
    const postedAfter = new Date(Date.now() - input.daysBack * 86_400_000).toISOString();
    const tenMinuteWindow = Math.floor(Date.now() / 600_000);
    const result = await jobService.enqueue({
      type: "amazon_refunds_sync",
      payload: {
        marketplaceAccountId: account.id,
        postedAfter,
        postedBefore,
        pageCount: 0,
        imported: 0,
      },
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      priority: 2,
      maxAttempts: 8,
      idempotencyKey: `amazon_refunds_sync:${account.id}:${input.daysBack}:${tenMinuteWindow}`,
      resourceKey: `marketplace-account:${account.id}:amazon-refunds-sync`,
    });
    const now = new Date().toISOString();
    await actor.supabaseAdmin.from("sync_checkpoints").upsert({
      workspace_id: actor.workspaceId,
      marketplace_account_id: account.id,
      resource_type: "amazon_refunds",
      cursor: { postedAfter, postedBefore },
      last_attempted_at: now,
      freshness_state: "syncing",
      updated_at: now,
    }, { onConflict: "workspace_id,marketplace_account_id,resource_type" });
    return NextResponse.json({ data: { jobId: result.jobId, status: result.status } }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid refunds sync request.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
