import { z } from "zod";
import type { JobContext, JobHandlerResult } from "@/lib/jobs/job-registry";
import {
  exchangeLwaRefreshToken,
  getAmazonMarketplaceAccount,
  readAmazonCredentialSet,
} from "@/lib/amazon/credentials";

const payloadSchema = z.object({
  marketplaceAccountId: z.string().uuid(),
  postedAfter: z.string().datetime(),
  postedBefore: z.string().datetime(),
  nextToken: z.string().max(10_000).optional(),
  pageCount: z.number().int().min(0).max(500).default(0),
  imported: z.number().int().min(0).default(0),
});

function endpoint(region: string): string {
  const normalized = region.toLowerCase();
  if (normalized.includes("north america")) return "https://sellingpartnerapi-na.amazon.com";
  if (normalized.includes("far east")) return "https://sellingpartnerapi-fe.amazon.com";
  return "https://sellingpartnerapi-eu.amazon.com";
}

async function spFetch(url: string, accessToken: string): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      headers: { "x-amz-access-token": accessToken, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === 4) return response;
    const retryAfter = Number(response.headers.get("retry-after") ?? Number.NaN);
    const delay = Number.isFinite(retryAfter)
      ? Math.min(retryAfter * 1_000, 30_000)
      : Math.min(1_000 * 2 ** attempt + Math.floor(Math.random() * 250), 15_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Amazon Finances API request exhausted its retry policy.");
}

function amountRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

async function stableRefundId(parts: string[]) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\u001f")));
  return `afr_${Buffer.from(digest).toString("hex").slice(0, 40)}`;
}

async function persistRefundEvents(
  ctx: JobContext,
  accountId: string,
  marketplaceId: string,
  events: Array<Record<string, unknown>>,
) {
  const rows: Array<Record<string, unknown>> = [];
  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    const orderId = String(event.AmazonOrderId ?? "").trim();
    const processedAt = typeof event.PostedDate === "string" ? event.PostedDate : "";
    if (!processedAt || Number.isNaN(Date.parse(processedAt))) continue;
    const shipmentItems = list(event.ShipmentItemAdjustmentList);
    if (shipmentItems.length === 0 && orderId) {
      rows.push({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        marketplace_account_id: accountId,
        refund_id: await stableRefundId([orderId, processedAt, "order", String(eventIndex)]),
        order_id: orderId,
        sku: null,
        asin: null,
        quantity: 1,
        amount: 0,
        currency: "INR",
        reason: "Amazon financial refund adjustment",
        status: "Processed",
        processed_at: processedAt,
        marketplace: marketplaceId,
        data_source: "amazon_sp_api_finances",
        source_metadata: { itemized: false },
        updated_at: new Date().toISOString(),
      });
    }

    for (let itemIndex = 0; itemIndex < shipmentItems.length; itemIndex += 1) {
      const item = shipmentItems[itemIndex];
      const charges = list(item.ItemChargeAdjustmentList);
      const chargeAmounts = charges.map((charge) => amountRecord(charge.ChargeAmount));
      const amount = chargeAmounts.reduce(
        (total, charge) => total + Math.abs(Number(charge.CurrencyAmount ?? 0) || 0),
        0,
      );
      const sku = String(item.SellerSKU ?? "").trim() || null;
      rows.push({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        marketplace_account_id: accountId,
        refund_id: await stableRefundId([orderId, processedAt, sku ?? "", String(itemIndex)]),
        order_id: orderId,
        sku,
        asin: null,
        quantity: Math.max(1, Math.abs(Math.trunc(Number(item.QuantityShipped ?? 1) || 1))),
        amount,
        currency: String(chargeAmounts[0]?.CurrencyCode ?? "INR"),
        reason: "Amazon financial refund adjustment",
        status: "Processed",
        processed_at: processedAt,
        marketplace: marketplaceId,
        data_source: "amazon_sp_api_finances",
        source_metadata: {
          itemized: true,
          chargeTypes: charges.map((charge) => String(charge.ChargeType ?? "")).filter(Boolean),
        },
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await ctx.supabaseAdmin
      .from("refunds")
      .upsert(rows, { onConflict: "workspace_id,marketplace_account_id,refund_id" });
    if (error) throw error;
  }
  return rows.length;
}

export async function runAmazonRefundsSync(ctx: JobContext): Promise<JobHandlerResult> {
  const payload = payloadSchema.parse(ctx.payload);
  if (payload.pageCount >= 500) throw new Error("Amazon refunds sync exceeded the 500-page safety limit.");
  const account = await getAmazonMarketplaceAccount(ctx.supabaseAdmin, ctx.workspaceId, payload.marketplaceAccountId);
  const credentials = await readAmazonCredentialSet(
    ctx.supabaseAdmin,
    ctx.workspaceId,
    account.id,
    "amazon_sp_api",
  );
  const accessToken = await exchangeLwaRefreshToken(credentials);
  const url = new URL(`${endpoint(account.region)}/finances/v0/financialEvents`);
  if (payload.nextToken) url.searchParams.set("NextToken", payload.nextToken);
  else {
    url.searchParams.set("PostedAfter", payload.postedAfter);
    url.searchParams.set("PostedBefore", payload.postedBefore);
  }
  const response = await spFetch(url.toString(), accessToken);
  if (!response.ok) throw new Error(`Amazon Finances API failed (HTTP ${response.status}).`);
  const body = (await response.json()) as {
    payload?: { FinancialEvents?: { RefundEventList?: Array<Record<string, unknown>> }; NextToken?: string };
  };
  const events = body.payload?.FinancialEvents?.RefundEventList ?? [];
  const pageImported = await persistRefundEvents(ctx, account.id, account.marketplaceId, events);
  const imported = payload.imported + pageImported;
  const pageCount = payload.pageCount + 1;
  const nextToken = body.payload?.NextToken;
  if (nextToken) {
    return {
      output: {},
      summary: `Imported ${imported} refund adjustments so far.`,
      continuation: {
        payload: { ...payload, nextToken, pageCount, imported },
        delaySeconds: 3,
        progress: Math.min(90, 10 + pageCount * 5),
        summary: "Fetching the next Amazon financial-events page.",
      },
    };
  }

  const now = new Date().toISOString();
  await ctx.supabaseAdmin.from("sync_checkpoints").upsert({
    workspace_id: ctx.workspaceId,
    marketplace_account_id: account.id,
    resource_type: "amazon_refunds",
    cursor: { from: payload.postedAfter, through: payload.postedBefore },
    last_attempted_at: now,
    last_succeeded_at: now,
    next_run_at: new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString(),
    failure_count: 0,
    freshness_state: "fresh",
    last_error_code: null,
    last_error_message: null,
    updated_at: now,
  }, { onConflict: "workspace_id,marketplace_account_id,resource_type" });
  return {
    output: { imported, postedAfter: payload.postedAfter, postedBefore: payload.postedBefore },
    summary: `Imported ${imported} Amazon refund adjustments.`,
  };
}
