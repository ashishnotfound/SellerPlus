import { z } from "zod";
import type { JobContext, JobHandlerResult } from "@/lib/jobs/job-registry";
import { mapAmazonStatus } from "@/lib/amazon-status-mapper";
import {
  exchangeLwaRefreshToken,
  getAmazonMarketplaceAccount,
  readAmazonCredentialSet,
} from "@/lib/amazon/credentials";
import {
  getOrderResponseSchema,
  orderCancellationReason,
  orderFinancials,
  type ReyoPackAmazonOrder,
  type ReyoPackAmazonPackage,
  reyoPackAmazonOrderSchema,
  searchOrdersResponseSchema,
} from "@/lib/amazon/reyo-pack-order-model";
import {
  AmazonSpApiError,
  amazonSpApiEndpoint,
  amazonSpApiFetchJson,
  nextAmazonPageDelaySeconds,
} from "@/lib/amazon/sp-api-client";
import { abortableDelay, type ExecutionBoundary } from "@/lib/execution-deadline";

const countersSchema = z.object({
  scanned: z.number().int().min(0).default(0),
  created: z.number().int().min(0).default(0),
  updated: z.number().int().min(0).default(0),
  cancelled: z.number().int().min(0).default(0),
  shipmentsUpdated: z.number().int().min(0).default(0),
  errors: z.number().int().min(0).default(0),
});

export const reyoPackSyncPayloadSchema = z.object({
  marketplaceAccountId: z.string().uuid(),
  syncRunId: z.string().uuid(),
  syncType: z.enum(["INCREMENTAL", "FULL", "ORDERS", "SHIPPING"]),
  updatedAfter: z.string().datetime(),
  updatedBefore: z.string().datetime(),
  phase: z.enum(["search", "shipping"]).default("search"),
  paginationToken: z.string().max(20_000).optional(),
  pendingOrders: z.array(reyoPackAmazonOrderSchema).max(100).default([]),
  pageCount: z.number().int().min(0).max(2_000).default(0),
  shippingAfterId: z.string().uuid().optional(),
  started: z.boolean().default(false),
  counters: countersSchema.default({
    scanned: 0,
    created: 0,
    updated: 0,
    cancelled: 0,
    shipmentsUpdated: 0,
    errors: 0,
  }),
});

type ReyoPackSyncPayload = z.infer<typeof reyoPackSyncPayloadSchema>;
type SyncCounters = z.infer<typeof countersSchema>;

function checkpointResourceType(payload: ReyoPackSyncPayload): string {
  return payload.syncType === "SHIPPING"
    ? "reyo_pack_amazon_shipping"
    : "reyo_pack_amazon_orders";
}

interface PersistResult {
  created: boolean;
  cancelled: boolean;
  shipmentsUpdated: number;
  errors: number;
}

function itemTotal(item: ReyoPackAmazonOrder["orderItems"][number]): {
  amount: number | null;
  currency: string | null;
} {
  const unitPrice = item.product.price?.unitPrice;
  if (!unitPrice) return { amount: null, currency: null };
  const amount = Number(unitPrice.amount);
  if (!Number.isFinite(amount) || amount < 0) return { amount: null, currency: null };
  return { amount: amount * item.quantityOrdered, currency: unitPrice.currencyCode };
}

function shippingChannel(fulfilledBy: "MERCHANT" | "AMAZON" | undefined): string | null {
  if (fulfilledBy === "MERCHANT") return "MFN";
  if (fulfilledBy === "AMAZON") return "AFN";
  return null;
}

async function persistSkuCatalog(
  ctx: JobContext,
  accountId: string,
  order: ReyoPackAmazonOrder,
): Promise<Map<string, string>> {
  const uniqueSkus = new Map<string, {
    workspace_id: string;
    marketplace_account_id: string;
    sku: string;
    asin: string | null;
    product_title: string | null;
    source: "AMAZON_ORDERS";
    source_updated_at: string;
    updated_at: string;
  }>();
  for (const item of order.orderItems) {
    const sku = item.product.sellerSku?.trim();
    if (!sku) continue;
    uniqueSkus.set(sku.toUpperCase(), {
      workspace_id: ctx.workspaceId,
      marketplace_account_id: accountId,
      sku,
      asin: item.product.asin ?? null,
      product_title: item.product.title?.slice(0, 10_000) ?? null,
      source: "AMAZON_ORDERS",
      source_updated_at: order.lastUpdatedTime,
      updated_at: new Date().toISOString(),
    });
  }
  if (uniqueSkus.size === 0) return new Map();

  const { data, error } = await ctx.supabaseAdmin
    .from("reyo_pack_skus")
    .upsert([...uniqueSkus.values()], {
      onConflict: "workspace_id,marketplace_account_id,sku_normalized",
    })
    .select("id, sku_normalized");
  if (error) throw error;
  return new Map((data ?? []).map((row) => [String(row.sku_normalized), String(row.id)]));
}

async function persistAmazonPackage(
  ctx: JobContext,
  accountId: string,
  orderId: string,
  sourceUpdatedAt: string,
  amazonPackage: ReyoPackAmazonPackage,
): Promise<{ updated: boolean; error: boolean }> {
  const { data, error } = await ctx.supabaseAdmin.rpc("upsert_reyo_pack_amazon_package", {
    p_workspace_id: ctx.workspaceId,
    p_marketplace_account_id: accountId,
    p_order_id: orderId,
    p_package_reference_id: amazonPackage.packageReferenceId,
    p_tracking_number: amazonPackage.trackingNumber ?? null,
    p_carrier: amazonPackage.carrier ?? null,
    p_package_status: amazonPackage.packageStatus?.status ?? null,
    p_shipping_service: amazonPackage.shippingService ?? null,
    p_package_created_at: amazonPackage.createdTime ?? null,
    p_source_updated_at: sourceUpdatedAt,
    p_package_items: amazonPackage.packageItems.map((item) => ({
      orderItemId: item.orderItemId,
      quantity: item.quantity,
    })),
    p_correlation_id: ctx.jobId,
  });
  if (error) throw error;
  const outcome = typeof data === "object" && data
    ? String((data as Record<string, unknown>).outcome ?? "")
    : "";
  if (amazonPackage.packageStatus?.detailedStatus || amazonPackage.shipTime || amazonPackage.shipFromAddress) {
    const shipmentId = typeof data === "object" && data
      ? (data as Record<string, unknown>).shipmentId
      : null;
    if (typeof shipmentId === "string") {
      const { error: detailsError } = await ctx.supabaseAdmin.rpc("update_reyo_pack_amazon_package_details", {
        p_workspace_id: ctx.workspaceId,
        p_shipment_id: shipmentId,
        p_status_detail: amazonPackage.packageStatus?.detailedStatus ?? null,
        p_ship_time: amazonPackage.shipTime ?? null,
        p_ship_from_address: amazonPackage.shipFromAddress ?? null,
        p_source_updated_at: sourceUpdatedAt,
      });
      if (detailsError) throw detailsError;
    }
  }
  return {
    updated: outcome !== "TERMINAL_UNCHANGED",
    error: outcome === "TERMINAL_ALLOCATION_CONFLICT"
      || outcome === "CLAIMED_ALLOCATION_CONFLICT",
  };
}

export async function persistReyoPackAmazonOrder(
  ctx: JobContext,
  accountId: string,
  fallbackMarketplaceId: string,
  order: ReyoPackAmazonOrder,
): Promise<PersistResult> {
  const { data: existingOrder, error: existingError } = await ctx.supabaseAdmin
    .from("orders")
    .select("id, cancellation_status")
    .eq("workspace_id", ctx.workspaceId)
    .eq("marketplace_account_id", accountId)
    .eq("channel", "amazon")
    .eq("channel_order_id", order.orderId)
    .maybeSingle();
  if (existingError) throw existingError;

  const financials = orderFinancials(order);
  const fulfillment = order.fulfillment;
  const shippedUnits = order.orderItems.reduce(
    (sum, item) => sum + (item.fulfillment?.quantityFulfilled ?? 0),
    0,
  );
  const unshippedUnits = order.orderItems.reduce(
    (sum, item) => sum + (
      item.fulfillment?.quantityUnfulfilled
      ?? Math.max(0, item.quantityOrdered - (item.fulfillment?.quantityFulfilled ?? 0))
    ),
    0,
  );
  const orderRow: Record<string, unknown> = {
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    marketplace_account_id: accountId,
    channel: "amazon",
    channel_order_id: order.orderId,
    status: mapAmazonStatus(fulfillment.fulfillmentStatus),
    amazon_order_status: fulfillment.fulfillmentStatus,
    purchase_date: order.createdTime,
    last_update_date: order.lastUpdatedTime,
    fulfillment_channel: shippingChannel(fulfillment.fulfilledBy),
    fulfilled_by: fulfillment.fulfilledBy ?? null,
    marketplace_id: order.salesChannel?.marketplaceId ?? fallbackMarketplaceId,
    amazon_programs: order.programs,
    number_of_items_shipped: shippedUnits,
    number_of_items_unshipped: unshippedUnits,
    ship_by_date: fulfillment.shipByWindow?.latestDateTime
      ?? fulfillment.shipByWindow?.earliestDateTime
      ?? null,
    shipping_service_level: fulfillment.fulfillmentServiceLevel ?? null,
    data_source: "amazon_sp_api_orders_2026_01_01",
    source_updated_at: order.lastUpdatedTime,
    last_amazon_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (financials.amount !== null) {
    orderRow.total_amount = financials.amount;
    orderRow.currency = financials.currency;
  } else if (!existingOrder) {
    orderRow.total_amount = null;
    orderRow.currency = null;
  }

  const { data: savedOrder, error: orderError } = await ctx.supabaseAdmin
    .from("orders")
    .upsert(orderRow, {
      onConflict: "workspace_id,marketplace_account_id,channel,channel_order_id",
    })
    .select("id")
    .single();
  if (orderError || !savedOrder) {
    throw orderError ?? new Error("Amazon order persistence failed.");
  }

  const skuIds = await persistSkuCatalog(ctx, accountId, order);
  const itemRows = order.orderItems.map((item) => {
    const price = itemTotal(item);
    const normalizedSku = item.product.sellerSku?.trim().toUpperCase();
    return {
      workspace_id: ctx.workspaceId,
      order_id: savedOrder.id,
      amazon_order_item_id: item.orderItemId,
      seller_sku: item.product.sellerSku?.slice(0, 500) ?? null,
      asin: item.product.asin?.slice(0, 20) ?? null,
      title: item.product.title?.slice(0, 2_000) ?? null,
      quantity_ordered: item.quantityOrdered,
      quantity_shipped: item.fulfillment?.quantityFulfilled ?? 0,
      item_price: price.amount,
      item_price_currency: price.currency,
      reyo_pack_sku_id: normalizedSku ? skuIds.get(normalizedSku) ?? null : null,
      updated_at: new Date().toISOString(),
    };
  });
  if (itemRows.length > 0) {
    const { error } = await ctx.supabaseAdmin.from("order_items").upsert(itemRows, {
      onConflict: "order_id,amazon_order_item_id",
    });
    if (error) throw error;
  }

  let shipmentsUpdated = 0;
  let errors = 0;
  for (const amazonPackage of order.packages) {
    const result = await persistAmazonPackage(
      ctx,
      accountId,
      savedOrder.id,
      order.lastUpdatedTime,
      amazonPackage,
    );
    if (result.updated) shipmentsUpdated += 1;
    if (result.error) errors += 1;
  }

  const cancelled = fulfillment.fulfillmentStatus === "CANCELLED";
  if (cancelled) {
    const reason = orderCancellationReason(order)?.slice(0, 1_000) ?? null;
    const { error } = await ctx.supabaseAdmin.rpc("apply_reyo_pack_cancellation", {
      p_workspace_id: ctx.workspaceId,
      p_order_id: savedOrder.id,
      p_cancelled_at: order.lastUpdatedTime,
      p_reason: reason,
      p_correlation_id: ctx.jobId,
    });
    if (error) throw error;
    const { error: sourceError } = await ctx.supabaseAdmin
      .from("orders")
      .update({ cancellation_time_source: "AMAZON_LAST_UPDATED_TIME" })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", savedOrder.id);
    if (sourceError) throw sourceError;
  }

  return {
    created: !existingOrder,
    cancelled,
    shipmentsUpdated,
    errors,
  };
}

async function updateSyncRun(
  ctx: JobContext,
  payload: ReyoPackSyncPayload,
  counters: SyncCounters,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await ctx.supabaseAdmin
    .from("reyo_pack_sync_runs")
    .update({
      orders_scanned: counters.scanned,
      orders_new: counters.created,
      orders_updated: counters.updated,
      orders_cancelled: counters.cancelled,
      shipments_updated: counters.shipmentsUpdated,
      error_count: counters.errors,
      updated_at: new Date().toISOString(),
      ...values,
    })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", payload.syncRunId);
  if (error) throw error;
}

async function fetchSearchPage(input: {
  baseUrl: string;
  accessToken: string;
  marketplaceId: string;
  updatedAfter: string;
  updatedBefore: string;
  paginationToken?: string;
  boundary: ExecutionBoundary;
}) {
  const query = new URLSearchParams({
    marketplaceIds: input.marketplaceId,
    fulfilledBy: "MERCHANT",
    maxResultsPerPage: "100",
    includedData: "CANCELLATION,FULFILLMENT,PACKAGES,PROCEEDS",
  });
  if (input.paginationToken) query.set("paginationToken", input.paginationToken);
  else {
    query.set("lastUpdatedAfter", input.updatedAfter);
    query.set("lastUpdatedBefore", input.updatedBefore);
  }
  const response = await amazonSpApiFetchJson<unknown>({
    baseUrl: input.baseUrl,
    path: "/orders/2026-01-01/orders",
    accessToken: input.accessToken,
    query,
    boundary: input.boundary,
  });
  return {
    page: searchOrdersResponseSchema.parse(response.data),
    rateLimit: response.rateLimit,
  };
}

async function fetchOrder(input: {
  baseUrl: string;
  accessToken: string;
  orderId: string;
  boundary: ExecutionBoundary;
}) {
  const query = new URLSearchParams({
    includedData: "CANCELLATION,FULFILLMENT,PACKAGES,PROCEEDS",
  });
  const response = await amazonSpApiFetchJson<unknown>({
    baseUrl: input.baseUrl,
    path: `/orders/2026-01-01/orders/${encodeURIComponent(input.orderId)}`,
    accessToken: input.accessToken,
    query,
    boundary: input.boundary,
  });
  return {
    order: getOrderResponseSchema.parse(response.data),
    rateLimit: response.rateLimit,
  };
}

function mergeCounters(counters: SyncCounters, result: PersistResult): SyncCounters {
  return {
    scanned: counters.scanned + 1,
    created: counters.created + (result.created ? 1 : 0),
    updated: counters.updated + (result.created ? 0 : 1),
    cancelled: counters.cancelled + (result.cancelled ? 1 : 0),
    shipmentsUpdated: counters.shipmentsUpdated + result.shipmentsUpdated,
    errors: counters.errors + result.errors,
  };
}

async function completeSync(
  ctx: JobContext,
  payload: ReyoPackSyncPayload,
  counters: SyncCounters,
): Promise<JobHandlerResult> {
  const { error } = await ctx.supabaseAdmin.rpc("complete_reyo_pack_sync", {
    p_workspace_id: ctx.workspaceId,
    p_sync_run_id: payload.syncRunId,
    p_updated_before: payload.updatedBefore,
    p_counters: counters,
    p_has_conflicts: counters.errors > 0,
  });
  if (error) throw error;

  return {
    output: {
      syncRunId: payload.syncRunId,
      status: counters.errors > 0 ? "PARTIAL" : "SUCCEEDED",
      ordersScanned: counters.scanned,
      ordersNew: counters.created,
      ordersUpdated: counters.updated,
      ordersCancelled: counters.cancelled,
      shipmentsUpdated: counters.shipmentsUpdated,
      errors: counters.errors,
    },
    summary: counters.errors > 0
      ? `Amazon sync completed with ${counters.errors} package conflict(s).`
      : `Synchronized ${counters.scanned} Amazon orders and ${counters.shipmentsUpdated} packages.`,
  };
}

async function runShippingRefresh(input: {
  ctx: JobContext;
  payload: ReyoPackSyncPayload;
  counters: SyncCounters;
  baseUrl: string;
  accessToken: string;
  marketplaceId: string;
  boundary: ExecutionBoundary;
}): Promise<JobHandlerResult> {
  let query = input.ctx.supabaseAdmin
    .from("orders")
    .select("id, channel_order_id")
    .eq("workspace_id", input.ctx.workspaceId)
    .eq("marketplace_account_id", input.payload.marketplaceAccountId)
    .eq("channel", "amazon")
    .eq("fulfilled_by", "MERCHANT")
    .in("amazon_order_status", ["UNSHIPPED", "PARTIALLY_SHIPPED"])
    .order("id", { ascending: true })
    .limit(5);
  if (input.payload.shippingAfterId) query = query.gt("id", input.payload.shippingAfterId);
  const { data: orderRows, error } = await query;
  if (error) throw error;
  if (!orderRows || orderRows.length === 0) {
    return completeSync(input.ctx, input.payload, input.counters);
  }

  let counters = input.counters;
  let lastRateLimit: number | null = null;
  for (let index = 0; index < orderRows.length; index += 1) {
    const fetched = await fetchOrder({
      baseUrl: input.baseUrl,
      accessToken: input.accessToken,
      orderId: String(orderRows[index].channel_order_id),
      boundary: input.boundary,
    });
    const result = await persistReyoPackAmazonOrder(
      input.ctx,
      input.payload.marketplaceAccountId,
      input.marketplaceId,
      fetched.order,
    );
    counters = mergeCounters(counters, result);
    lastRateLimit = fetched.rateLimit;
    if (index < orderRows.length - 1) {
      await abortableDelay(
        nextAmazonPageDelaySeconds(fetched.rateLimit, 2) * 1_000,
        input.boundary,
        1_000,
      );
    }
  }

  await updateSyncRun(input.ctx, input.payload, counters, {
    status: "RUNNING",
    progress_message: `Refreshed shipping data for ${counters.scanned} active orders.`,
  });
  return {
    output: {},
    summary: `Refreshed shipping data for ${counters.scanned} active orders so far.`,
    continuation: {
      payload: {
        ...input.payload,
        started: true,
        counters,
        shippingAfterId: String(orderRows[orderRows.length - 1].id),
      },
      delaySeconds: nextAmazonPageDelaySeconds(lastRateLimit, 2),
      progress: Math.min(95, 5 + counters.scanned),
      summary: "Refreshing the next active Amazon orders.",
    },
  };
}

export async function runReyoPackAmazonSync(ctx: JobContext): Promise<JobHandlerResult> {
  const payload = reyoPackSyncPayloadSchema.parse(ctx.payload);
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

  try {
    if (!payload.started) {
      const attemptedAt = new Date().toISOString();
      await updateSyncRun(ctx, payload, payload.counters, {
        status: "RUNNING",
        started_at: attemptedAt,
        progress_message: payload.phase === "shipping"
          ? "Refreshing active order package data."
          : "Searching Amazon orders updated in the synchronization window.",
      });
      const { data: existingCheckpoint, error: checkpointReadError } = await ctx.supabaseAdmin
        .from("sync_checkpoints")
        .select("cursor")
        .eq("workspace_id", ctx.workspaceId)
        .eq("marketplace_account_id", payload.marketplaceAccountId)
        .eq("resource_type", checkpointResourceType(payload))
        .maybeSingle();
      if (checkpointReadError) throw checkpointReadError;
      const { error: checkpointWriteError } = await ctx.supabaseAdmin
        .from("sync_checkpoints")
        .upsert({
          workspace_id: ctx.workspaceId,
          marketplace_account_id: payload.marketplaceAccountId,
          resource_type: checkpointResourceType(payload),
          cursor: existingCheckpoint?.cursor ?? {},
          last_attempted_at: attemptedAt,
          next_run_at: null,
          freshness_state: "syncing",
          last_error_code: null,
          last_error_message: null,
          updated_at: attemptedAt,
        }, { onConflict: "workspace_id,marketplace_account_id,resource_type" });
      if (checkpointWriteError) throw checkpointWriteError;
    }

    const accessToken = await exchangeLwaRefreshToken(credentials, boundary);
    const baseUrl = amazonSpApiEndpoint(account.region);
    if (payload.phase === "shipping") {
      return runShippingRefresh({
        ctx,
        payload,
        counters: payload.counters,
        baseUrl,
        accessToken,
        marketplaceId: account.marketplaceId,
        boundary,
      });
    }

    let pendingOrders = payload.pendingOrders;
    let paginationToken = payload.paginationToken;
    let pageCount = payload.pageCount;
    let nextPageDelay = 180;
    if (pendingOrders.length === 0) {
      if (pageCount >= 2_000) {
        throw new Error("Amazon order synchronization exceeded its 2,000-page safety limit.");
      }
      const fetched = await fetchSearchPage({
        baseUrl,
        accessToken,
        marketplaceId: account.marketplaceId,
        updatedAfter: payload.updatedAfter,
        updatedBefore: payload.updatedBefore,
        paginationToken,
        boundary,
      });
      pendingOrders = fetched.page.orders;
      paginationToken = fetched.page.pagination?.nextToken;
      pageCount += 1;
      nextPageDelay = nextAmazonPageDelaySeconds(fetched.rateLimit);
      if (pendingOrders.length === 0 && !paginationToken) {
        return completeSync(ctx, payload, payload.counters);
      }
    }

    let counters = payload.counters;
    const chunk = pendingOrders.slice(0, 5);
    for (const order of chunk) {
      const result = await persistReyoPackAmazonOrder(
        ctx,
        account.id,
        account.marketplaceId,
        order,
      );
      counters = mergeCounters(counters, result);
    }
    const remaining = pendingOrders.slice(chunk.length);
    await updateSyncRun(ctx, payload, counters, {
      status: "RUNNING",
      progress_message: `Scanned ${counters.scanned} orders; ${counters.shipmentsUpdated} packages updated.`,
    });

    if (remaining.length > 0 || paginationToken) {
      return {
        output: {},
        summary: `Synchronized ${counters.scanned} Amazon orders so far.`,
        continuation: {
          payload: {
            ...payload,
            started: true,
            pendingOrders: remaining,
            paginationToken,
            pageCount,
            counters,
          },
          delaySeconds: remaining.length > 0 ? 5 : nextPageDelay,
          progress: Math.min(95, 5 + pageCount * 3),
          summary: remaining.length > 0
            ? "Persisting the current Amazon order page."
            : "Waiting for the Amazon searchOrders rate limit before the next page.",
        },
      };
    }
    return completeSync(ctx, payload, counters);
  } catch (error) {
    const errorCode = error instanceof AmazonSpApiError
      ? `AMAZON_HTTP_${error.status}`
      : error instanceof z.ZodError
        ? "AMAZON_RESPONSE_VALIDATION_FAILED"
        : "AMAZON_SYNC_FAILED";
    const message = error instanceof Error ? error.message : "Amazon synchronization failed.";
    const failedCounters = { ...payload.counters, errors: payload.counters.errors + 1 };
    await updateSyncRun(ctx, payload, failedCounters, {
      status: "RUNNING",
      progress_message: "Amazon synchronization failed and will follow the durable job retry policy.",
      last_error_code: errorCode,
      last_error_message: message.slice(0, 1_000),
    }).catch(() => undefined);
    throw error;
  }
}
