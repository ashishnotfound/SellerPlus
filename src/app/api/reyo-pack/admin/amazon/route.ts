import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";
import { getAmazonMarketplaceAccount } from "@/lib/amazon/credentials";

const accountIdSchema = z.string().uuid().optional();

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "reyo_pack.admin");
    const accountId = accountIdSchema.parse(
      new URL(request.url).searchParams.get("marketplaceAccountId") ?? undefined,
    );
    const account = await getAmazonMarketplaceAccount(
      actor.supabaseAdmin,
      actor.workspaceId,
      accountId,
    );
    const [{ data: checkpoint, error: checkpointError }, { data: runs, error: runsError }] =
      await Promise.all([
        actor.supabaseAdmin
          .from("sync_checkpoints")
          .select("last_attempted_at, last_succeeded_at, freshness_state, last_error_code, last_error_message, updated_at")
          .eq("workspace_id", actor.workspaceId)
          .eq("marketplace_account_id", account.id)
          .eq("resource_type", "reyo_pack_amazon_orders")
          .maybeSingle(),
        actor.supabaseAdmin
          .from("reyo_pack_sync_runs")
          .select("id, job_id, sync_type, status, orders_scanned, orders_new, orders_updated, orders_cancelled, shipments_updated, error_count, progress_message, last_error_code, last_error_message, started_at, completed_at, created_at, updated_at")
          .eq("workspace_id", actor.workspaceId)
          .eq("marketplace_account_id", account.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
    if (checkpointError) throw checkpointError;
    if (runsError) throw runsError;

    const latestRun = runs?.[0] ?? null;
    const connected = account.status === "active"
      && account.capabilities.includes("selling_partner");
    const apiHealth = !connected
      ? "DISCONNECTED"
      : latestRun?.status === "RUNNING" || latestRun?.status === "QUEUED"
        ? "SYNCING"
        : latestRun?.status === "FAILED"
          ? "DEGRADED"
          : "AVAILABLE";

    return NextResponse.json({ data: {
      connection: {
        marketplaceAccountId: account.id,
        displayName: account.displayName,
        marketplaceId: account.marketplaceId,
        connected,
        accountStatus: account.status,
        apiHealth,
      },
      checkpoint: checkpoint ?? null,
      latestRun,
      runs: runs ?? [],
      limitations: {
        ordersApiVersion: "2026-01-01",
        labelDocuments: "Only available when returned by an authorized Amazon shipping workflow; order synchronization does not fabricate labels.",
        cancellationTime: "Amazon Orders v2026-01-01 does not expose a separate cancellation timestamp; SellerPlus records the source lastUpdatedTime.",
      },
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid marketplace account ID." }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
