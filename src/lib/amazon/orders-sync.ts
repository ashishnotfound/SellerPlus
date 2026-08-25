import { z } from "zod";
import type { JobContext, JobHandlerResult } from "@/lib/jobs/job-registry";
import { mapAmazonStatus } from "@/lib/amazon-status-mapper";
import {
  exchangeLwaRefreshToken,
  getAmazonMarketplaceAccount,
  readAmazonCredentialSet,
} from "@/lib/amazon/credentials";
import {
  abortableDelay,
  createRequestSignal,
  type ExecutionBoundary,
} from "@/lib/execution-deadline";

const orderSchema = z.object({
  AmazonOrderId: z.string().min(1).max(100),
  PurchaseDate: z.string().optional(),
  LastUpdateDate: z.string().optional(),
  OrderStatus: z.string().default("Pending"),
  FulfillmentChannel: z.string().optional(),
  OrderTotal: z.object({ CurrencyCode: z.string().optional(), Amount: z.string().optional() }).optional(),
  MarketplaceId: z.string().optional(),
  NumberOfItemsShipped: z.number().optional(),
  NumberOfItemsUnshipped: z.number().optional(),
}).passthrough();

const payloadSchema = z.object({
  marketplaceAccountId: z.string().uuid(),
  updatedAfter: z.string().datetime(),
  phase: z.enum(["orders", "inventory"]).default("orders"),
  nextToken: z.string().max(10_000).optional(),
  pendingOrders: z.array(orderSchema).max(100).default([]),
  inventoryNextToken: z.string().max(10_000).optional(),
  imported: z.number().int().min(0).default(0),
  inventoryImported: z.number().int().min(0).default(0),
  pageCount: z.number().int().min(0).max(500).default(0),
});

type AmazonOrder = z.infer<typeof orderSchema>;

function endpoint(region: string): string {
  const normalized = region.toLowerCase();
  if (normalized.includes("north america")) return "https://sellingpartnerapi-na.amazon.com";
  if (normalized.includes("far east")) return "https://sellingpartnerapi-fe.amazon.com";
  return "https://sellingpartnerapi-eu.amazon.com";
}

async function spFetch(
  url: string,
  accessToken: string,
  boundary: ExecutionBoundary,
): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      headers: { "x-amz-access-token": accessToken, Accept: "application/json" },
      cache: "no-store",
      signal: createRequestSignal(boundary, 20_000),
    });
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === 4) return response;
    const retryAfter = Number(response.headers.get("retry-after") ?? Number.NaN);
    const delay = Number.isFinite(retryAfter)
      ? Math.min(retryAfter * 1_000, 30_000)
      : Math.min(750 * 2 ** attempt + Math.floor(Math.random() * 250), 12_000);
    await abortableDelay(delay, boundary, 1_000);
  }
  throw new Error("Amazon SP-API request exhausted its retry policy.");
}

async function loadOrderItems(
  baseUrl: string,
  accessToken: string,
  orderId: string,
  boundary: ExecutionBoundary,
) {
  const items: Array<Record<string, unknown>> = [];
  let nextToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${baseUrl}/orders/v0/orders/${encodeURIComponent(orderId)}/orderItems`);
    if (nextToken) url.searchParams.set("NextToken", nextToken);
    const response = await spFetch(url.toString(), accessToken, boundary);
    if (!response.ok) throw new Error(`Amazon order items failed (HTTP ${response.status}).`);
    const body = (await response.json()) as {
      payload?: { OrderItems?: Array<Record<string, unknown>>; NextToken?: string };
    };
    items.push(...(body.payload?.OrderItems ?? []));
    nextToken = body.payload?.NextToken;
    if (!nextToken) break;
  }
  return items;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function persistOrder(
  ctx: JobContext,
  accountId: string,
  marketplaceId: string,
  order: AmazonOrder,
  items: Array<Record<string, unknown>>,
) {
  const now = new Date().toISOString();
  const { data: savedOrder, error: orderError } = await ctx.supabaseAdmin
    .from("orders")
    .upsert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      marketplace_account_id: accountId,
      channel: "amazon",
      channel_order_id: order.AmazonOrderId,
      status: mapAmazonStatus(order.OrderStatus),
      total_amount: Math.max(0, numberValue(order.OrderTotal?.Amount)),
      currency: order.OrderTotal?.CurrencyCode ?? "INR",
      purchase_date: order.PurchaseDate ?? null,
      last_update_date: order.LastUpdateDate ?? null,
      fulfillment_channel: order.FulfillmentChannel ?? null,
      marketplace_id: order.MarketplaceId ?? marketplaceId,
      number_of_items_shipped: Math.max(0, order.NumberOfItemsShipped ?? 0),
      number_of_items_unshipped: Math.max(0, order.NumberOfItemsUnshipped ?? 0),
      data_source: "amazon_sp_api_orders",
      source_updated_at: now,
      updated_at: now,
    }, { onConflict: "workspace_id,marketplace_account_id,channel,channel_order_id" })
    .select("id")
    .single();
  if (orderError || !savedOrder) throw orderError ?? new Error("Order persistence failed.");

  const rows = items.flatMap((item) => {
    const itemId = String(item.OrderItemId ?? "").trim();
    if (!itemId) return [];
    const itemPrice = item.ItemPrice as Record<string, unknown> | undefined;
    return [{
      workspace_id: ctx.workspaceId,
      order_id: savedOrder.id,
      amazon_order_item_id: itemId,
      seller_sku: String(item.SellerSKU ?? "").slice(0, 500) || null,
      asin: String(item.ASIN ?? "").slice(0, 20) || null,
      title: String(item.Title ?? "").slice(0, 2_000) || null,
      quantity_ordered: Math.max(0, Math.trunc(numberValue(item.QuantityOrdered))),
      quantity_shipped: Math.max(0, Math.trunc(numberValue(item.QuantityShipped))),
      item_price: Math.max(0, numberValue(itemPrice?.Amount)),
      item_price_currency: String(itemPrice?.CurrencyCode ?? order.OrderTotal?.CurrencyCode ?? "INR"),
    }];
  });
  if (rows.length > 0) {
    const { error } = await ctx.supabaseAdmin
      .from("order_items")
      .upsert(rows, { onConflict: "order_id,amazon_order_item_id" });
    if (error) throw error;
  }
}

async function fetchOrdersPage(
  baseUrl: string,
  accessToken: string,
  marketplaceId: string,
  updatedAfter: string,
  nextToken?: string,
  boundary: ExecutionBoundary = {},
) {
  const url = new URL(`${baseUrl}/orders/v0/orders`);
  url.searchParams.set("MarketplaceIds", marketplaceId);
  url.searchParams.set("MaxResultsPerPage", "100");
  if (nextToken) url.searchParams.set("NextToken", nextToken);
  else url.searchParams.set("LastUpdatedAfter", updatedAfter);
  const response = await spFetch(url.toString(), accessToken, boundary);
  if (!response.ok) throw new Error(`Amazon Orders API failed (HTTP ${response.status}).`);
  const body = (await response.json()) as {
    payload?: { Orders?: unknown[]; NextToken?: string };
  };
  return {
    orders: z.array(orderSchema).max(100).parse(body.payload?.Orders ?? []),
    nextToken: body.payload?.NextToken,
  };
}

async function syncInventoryPage(
  ctx: JobContext,
  baseUrl: string,
  accessToken: string,
  accountId: string,
  marketplaceId: string,
  nextToken?: string,
  boundary: ExecutionBoundary = {},
) {
  const url = new URL(`${baseUrl}/fba/inventory/v1/summaries`);
  url.searchParams.set("details", "true");
  url.searchParams.set("granularityType", "Marketplace");
  url.searchParams.set("granularityId", marketplaceId);
  url.searchParams.set("marketplaceIds", marketplaceId);
  if (nextToken) url.searchParams.set("nextToken", nextToken);
  const response = await spFetch(url.toString(), accessToken, boundary);
  if (!response.ok) throw new Error(`Amazon FBA Inventory API failed (HTTP ${response.status}).`);
  const body = (await response.json()) as {
    payload?: { inventorySummaries?: Array<Record<string, unknown>>; pagination?: { nextToken?: string } };
    pagination?: { nextToken?: string };
  };
  const summaries = body.payload?.inventorySummaries ?? [];
  const now = new Date().toISOString();
  const rows = summaries.flatMap((summary) => {
    const sku = String(summary.sellerSku ?? "").trim();
    if (!sku) return [];
    const details = (summary.inventoryDetails ?? {}) as Record<string, unknown>;
    return [{
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      marketplace_account_id: accountId,
      sku,
      name: String(summary.productName ?? sku).slice(0, 1_000),
      current_stock: Math.max(0, Math.trunc(numberValue(details.fulfillableQuantity))),
      incoming_stock: Math.max(0, Math.trunc(
        numberValue(details.inboundWorkingQuantity) +
        numberValue(details.inboundShippedQuantity) +
        numberValue(details.inboundReceivingQuantity),
      )),
      data_source: "amazon_sp_api_fba_inventory",
      source_updated_at: now,
      updated_at: now,
    }];
  });
  if (rows.length > 0) {
    const { error } = await ctx.supabaseAdmin.from("inventory_planner").upsert(
      rows,
      { onConflict: "workspace_id,marketplace_account_id,sku" },
    );
    if (error) throw error;
  }
  return {
    imported: rows.length,
    nextToken: body.payload?.pagination?.nextToken ?? body.pagination?.nextToken,
  };
}

export async function runAmazonOrdersSync(ctx: JobContext): Promise<JobHandlerResult> {
  const payload = payloadSchema.parse(ctx.payload);
  const account = await getAmazonMarketplaceAccount(
    ctx.supabaseAdmin,
    ctx.workspaceId,
    payload.marketplaceAccountId,
  );
  const credentials = await readAmazonCredentialSet(
    ctx.supabaseAdmin,
    ctx.workspaceId,
    account.id,
    "amazon_sp_api",
  );
  const boundary = { signal: ctx.signal, deadlineAt: ctx.deadlineAt };
  const accessToken = await exchangeLwaRefreshToken(credentials, boundary);
  const baseUrl = endpoint(account.region);

  if (payload.phase === "inventory") {
    const page = await syncInventoryPage(
      ctx,
      baseUrl,
      accessToken,
      account.id,
      account.marketplaceId,
      payload.inventoryNextToken,
      boundary,
    );
    const inventoryImported = payload.inventoryImported + page.imported;
    if (page.nextToken) {
      return {
        output: {},
        summary: "Amazon inventory sync is continuing.",
        continuation: {
          payload: { ...payload, inventoryNextToken: page.nextToken, inventoryImported },
          delaySeconds: 3,
          progress: 95,
          summary: "Importing another Amazon inventory page.",
        },
      };
    }
    const now = new Date().toISOString();
    await ctx.supabaseAdmin.from("sync_checkpoints").upsert({
      workspace_id: ctx.workspaceId,
      marketplace_account_id: account.id,
      resource_type: "amazon_orders_inventory",
      cursor: { lastUpdatedAfter: payload.updatedAfter },
      last_attempted_at: now,
      last_succeeded_at: now,
      next_run_at: new Date(Date.now() + 15 * 60 * 1_000).toISOString(),
      failure_count: 0,
      freshness_state: "fresh",
      last_error_code: null,
      last_error_message: null,
      updated_at: now,
    }, { onConflict: "workspace_id,marketplace_account_id,resource_type" });
    return {
      output: { ordersImported: payload.imported, inventoryImported },
      summary: `Imported ${payload.imported} Amazon orders and ${inventoryImported} inventory records.`,
    };
  }

  let pendingOrders = payload.pendingOrders;
  let nextToken = payload.nextToken;
  let pageCount = payload.pageCount;
  if (pendingOrders.length === 0) {
    if (pageCount >= 500) throw new Error("Amazon Orders sync exceeded the 500-page safety limit.");
    const page = await fetchOrdersPage(
      baseUrl,
      accessToken,
      account.marketplaceId,
      payload.updatedAfter,
      nextToken,
      boundary,
    );
    pendingOrders = page.orders;
    nextToken = page.nextToken;
    pageCount += 1;
    if (pendingOrders.length === 0 && !nextToken) {
      return {
        output: {},
        summary: "No new Amazon orders; inventory sync is next.",
        continuation: {
          payload: { ...payload, phase: "inventory", nextToken: undefined, pendingOrders: [], pageCount },
          delaySeconds: 2,
          progress: 90,
          summary: "Orders are current. Importing FBA inventory.",
        },
      };
    }
  }

  const chunk = pendingOrders.slice(0, 3);
  for (const order of chunk) {
    const items = await loadOrderItems(baseUrl, accessToken, order.AmazonOrderId, boundary);
    await persistOrder(ctx, account.id, account.marketplaceId, order, items);
  }
  const remaining = pendingOrders.slice(chunk.length);
  const imported = payload.imported + chunk.length;

  if (remaining.length > 0 || nextToken) {
    return {
      output: {},
      summary: `Imported ${imported} Amazon orders so far.`,
      continuation: {
        payload: {
          ...payload,
          pendingOrders: remaining,
          nextToken,
          imported,
          pageCount,
        },
        delaySeconds: remaining.length > 0 ? 3 : 5,
        progress: Math.min(85, 15 + pageCount * 5),
        summary: remaining.length > 0 ? "Importing the current order page." : "Fetching the next Amazon order page.",
      },
    };
  }

  return {
    output: {},
    summary: "Amazon orders imported; inventory sync is next.",
    continuation: {
      payload: { ...payload, phase: "inventory", pendingOrders: [], nextToken: undefined, imported, pageCount },
      delaySeconds: 2,
      progress: 90,
      summary: "Orders are current. Importing FBA inventory.",
    },
  };
}
