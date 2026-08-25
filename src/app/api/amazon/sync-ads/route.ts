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
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
}).strict();

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "advertising.manage");
    const raw = await request.text();
    const input = requestSchema.parse(raw ? JSON.parse(raw) : {});
    const account = await getAmazonMarketplaceAccount(
      actor.supabaseAdmin,
      actor.workspaceId,
      input.marketplaceAccountId,
    );
    if (!account.capabilities.includes("advertising")) {
      return NextResponse.json({
        error: "Amazon Ads is not connected for this marketplace account.",
        code: "ADS_NOT_CONNECTED",
      }, { status: 409 });
    }

    const endDate = input.endDate ?? dateOnly(new Date());
    const start = new Date(`${endDate}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - 29);
    const startDate = input.startDate ?? dateOnly(start);
    const rangeDays = Math.ceil(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
        86_400_000,
    );
    if (!Number.isFinite(rangeDays) || rangeDays < 0 || rangeDays > 30) {
      return NextResponse.json({
        error: "Amazon Sponsored Products campaign reports support a date range of up to 31 days.",
        code: "INVALID_DATE_RANGE",
      }, { status: 400 });
    }

    const twoMinuteWindow = Math.floor(Date.now() / 120_000);
    const result = await jobService.enqueue({
      type: "amazon_ads_sync",
      payload: {
        marketplaceAccountId: account.id,
        startDate,
        endDate,
        pollCount: 0,
      },
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      priority: 2,
      maxAttempts: 8,
      idempotencyKey: `amazon_ads_sync:${account.id}:${startDate}:${endDate}:${twoMinuteWindow}`,
      resourceKey: `marketplace-account:${account.id}:amazon-ads-sync`,
    });

    const now = new Date().toISOString();
    await actor.supabaseAdmin.from("sync_checkpoints").upsert({
      workspace_id: actor.workspaceId,
      marketplace_account_id: account.id,
      resource_type: "amazon_ads_campaign_performance",
      cursor: { startDate, endDate },
      last_attempted_at: now,
      freshness_state: "syncing",
      updated_at: now,
    }, { onConflict: "workspace_id,marketplace_account_id,resource_type" });

    return NextResponse.json({
      data: {
        jobId: result.jobId,
        status: result.status,
        startDate,
        endDate,
      },
    }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid Ads sync request.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
