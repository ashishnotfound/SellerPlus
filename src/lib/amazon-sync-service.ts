/**
 * Amazon Orders Sync Service
 * 
 * Production-grade synchronization engine for Amazon SP-API Orders.
 * Handles pagination, rate limiting with exponential backoff, 
 * delta sync via LastUpdatedAfter, and database upserts.
 */

import { mapAmazonStatus } from "@/lib/amazon-status-mapper";
import { log } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ───────────────────────────────────────────────────────────

export interface AmazonCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  region: string;
  sandbox?: boolean;
}

export interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  LastUpdateDate: string;
  OrderStatus: string;
  FulfillmentChannel: string;
  OrderTotal?: { CurrencyCode: string; Amount: string };
  MarketplaceId: string;
  NumberOfItemsShipped: number;
  NumberOfItemsUnshipped: number;
}

export interface AmazonOrderItem {
  OrderItemId: string;
  ASIN: string;
  SellerSKU: string;
  Title: string;
  QuantityOrdered: number;
  QuantityShipped: number;
  ItemPrice?: { CurrencyCode: string; Amount: string };
}

export interface SyncSummary {
  ordersFetched: number;
  newOrdersImported: number;
  existingOrdersUpdated: number;
  failedOrders: number;
  durationMs: number;
  errors: string[];
}

interface ResolvedEndpoint {
  spApiUrl: string;
  marketplaceId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function resolveEndpoint(region: string, sandbox?: boolean): ResolvedEndpoint {
  let spApiUrl = "https://sellingpartnerapi-eu.amazon.com";
  let marketplaceId = "A21TJRUUN4KGV"; // India

  const normRegion = (region || "").toLowerCase();
  if (normRegion.includes("us") || normRegion.includes("north america") || normRegion.includes("com")) {
    spApiUrl = "https://sellingpartnerapi-na.amazon.com";
    marketplaceId = "ATVPDKIKX0DER";
  } else if (normRegion.includes("europe") || normRegion.includes("co.uk") || normRegion.includes("uk")) {
    spApiUrl = "https://sellingpartnerapi-eu.amazon.com";
    marketplaceId = "A1F83G8C2ARO7P";
  } else if (normRegion.includes("far east") || normRegion.includes("japan") || normRegion.includes("jp")) {
    spApiUrl = "https://sellingpartnerapi-fe.amazon.com";
    marketplaceId = "A1VC38T7YXB528";
  }

  if (sandbox) {
    spApiUrl = spApiUrl.replace("https://", "https://sandbox.");
  }

  return { spApiUrl, marketplaceId };
}

async function getAccessToken(credentials: AmazonCredentials): Promise<string> {
  const tokenUrl = "https://api.amazon.com/auth/o2/token";
  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.clientId.trim(),
      client_secret: credentials.clientSecret.trim(),
      refresh_token: credentials.refreshToken.trim()
    })
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`LWA Token Exchange Failed (HTTP ${tokenRes.status}): ${errText}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function fetchWithBackoff(
  url: string,
  headers: Record<string, string>,
  maxRetries: number = 5
): Promise<Response> {
  let attempt = 0;
  let delay = 1000;

  while (attempt < maxRetries) {
    const res = await fetch(url, { method: "GET", headers });

    if (res.status === 429) {
      attempt++;
      console.warn(`[OrdersSync] Rate limited (429). Attempt ${attempt}/${maxRetries}. Waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30000); // Cap backoff at 30 seconds
      continue;
    }

    return res;
  }
  throw new Error(`Rate limit exceeded after ${maxRetries} retries for URL: ${url}`);
}

// ─── SP-API Connectors ───────────────────────────────────────────────

/**
 * Fetch all orders using pagination.
 */
export async function fetchAllOrders(
  credentials: AmazonCredentials,
  since: string = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() // Default 90 days
): Promise<{ orders: AmazonOrder[]; accessToken: string; endpoint: ResolvedEndpoint }> {
  const accessToken = await getAccessToken(credentials);
  const endpoint = resolveEndpoint(credentials.region, credentials.sandbox);
  const allOrders: AmazonOrder[] = [];
  let nextToken: string | null = null;

  do {
    let url: string;

    if (nextToken) {
      const params = new URLSearchParams({
        MarketplaceIds: endpoint.marketplaceId,
        NextToken: nextToken
      });
      url = `${endpoint.spApiUrl}/orders/v0/orders?${params.toString()}`;
    } else {
      const params = new URLSearchParams({
        MarketplaceIds: endpoint.marketplaceId,
        LastUpdatedAfter: since,
        MaxResultsPerPage: "100"
      });
      url = `${endpoint.spApiUrl}/orders/v0/orders?${params.toString()}`;
    }

    log.info(`[OrdersSync] Fetching orders page: ${url}`);
    const res = await fetchWithBackoff(url, {
      "x-amz-access-token": accessToken,
      "Accept": "application/json"
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Orders fetch failed (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json();
    const pageOrders: AmazonOrder[] = data.payload?.Orders || [];
    allOrders.push(...pageOrders);

    nextToken = data.payload?.NextToken || null;
    log.info(`[OrdersSync] Page fetched: ${pageOrders.length} orders. Total so far: ${allOrders.length}`);
  } while (nextToken);

  log.info(`[OrdersSync] All pages fetched. Total orders: ${allOrders.length}`);
  return { orders: allOrders, accessToken, endpoint };
}

/**
 * Fetch order items for a single order.
 */
export async function fetchOrderItems(
  orderId: string,
  accessToken: string,
  endpoint: ResolvedEndpoint
): Promise<AmazonOrderItem[]> {
  const url = `${endpoint.spApiUrl}/orders/v0/orders/${orderId}/orderItems`;

  const res = await fetchWithBackoff(url, {
    "x-amz-access-token": accessToken,
    "Accept": "application/json"
  });

  if (!res.ok) {
    const errText = await res.text();
    log.error(`[OrdersSync] Failed to fetch items for order ${orderId}: ${errText}`);
    return [];
  }

  const data = await res.json();
  return data.payload?.OrderItems || [];
}

/**
 * Fetch financial events for a single order (Finances API).
 */
export async function fetchOrderFinancialEvents(
  orderId: string,
  accessToken: string,
  endpoint: ResolvedEndpoint
): Promise<any> {
  const url = `${endpoint.spApiUrl}/finances/v0/orders/${orderId}/financialEvents`;

  const res = await fetchWithBackoff(url, {
    "x-amz-access-token": accessToken,
    "Accept": "application/json"
  });

  if (!res.ok) {
    const errText = await res.text();
    log.error(`[FinancesSync] Failed to fetch financial events for order ${orderId}: ${errText}`);
    return null;
  }

  const data = await res.json();
  return data.payload?.FinancialEvents || null;
}

// ─── Financial calculations ──────────────────────────────────────────

export function calculateOrderFees(financialEvents: any) {
  let commission = 0;
  let fbaFees = 0;
  let shippingCost = 0;

  if (!financialEvents) {
    return { commission, fbaFees, shippingCost };
  }

  // Parse shipment events
  const shipments = financialEvents.ShipmentEventList || [];
  for (const shipment of shipments) {
    const items = shipment.ShipmentItemList || [];
    for (const item of items) {
      // Parse item fees
      const fees = item.ItemFeeList || [];
      for (const fee of fees) {
        const amount = parseFloat(fee.FeeAmount?.CurrencyAmount || "0");
        const type = fee.FeeType || "";
        
        if (type.includes("Referral") || type.includes("Commission")) {
          commission += Math.abs(amount);
        } else if (type.includes("FBA") || type.includes("Fulfillment") || type.includes("FBAPickAndPack")) {
          fbaFees += Math.abs(amount);
        } else if (type.includes("Shipping") || type.includes("Delivery")) {
          shippingCost += Math.abs(amount);
        } else {
          fbaFees += Math.abs(amount);
        }
      }
    }
  }

  // Parse refund events
  const refunds = financialEvents.RefundEventList || [];
  for (const refund of refunds) {
    const items = refund.ShipmentItemList || [];
    for (const item of items) {
      const fees = item.ItemFeeList || [];
      for (const fee of fees) {
        const amount = parseFloat(fee.FeeAmount?.CurrencyAmount || "0");
        const type = fee.FeeType || "";
        if (type.includes("Referral") || type.includes("Commission")) {
          commission -= Math.abs(amount); // Refund returns commission
        } else if (type.includes("FBA") || type.includes("Fulfillment") || type.includes("FBAPickAndPack")) {
          fbaFees -= Math.abs(amount);
        }
      }
    }
  }

  return { commission, fbaFees, shippingCost };
}

/**
 * Seed default raw materials if not already created.
 */
export async function seedRawMaterials(supabase: SupabaseClient<any, "public", any>, userId: string) {
  const { count, error } = await supabase
    .from("raw_materials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (!error && count === 0) {
    const defaults = [
      { user_id: userId, name: "Paper A3", current_stock: 1000, minimum_stock: 50, unit: "pcs" },
      { user_id: userId, name: "Paper A4", current_stock: 1500, minimum_stock: 50, unit: "pcs" },
      { user_id: userId, name: "Tubes", current_stock: 500, minimum_stock: 20, unit: "pcs" },
      { user_id: userId, name: "Boxes A4", current_stock: 300, minimum_stock: 20, unit: "pcs" },
      { user_id: userId, name: "Labels", current_stock: 2000, minimum_stock: 100, unit: "pcs" },
      { user_id: userId, name: "Tape", current_stock: 100, minimum_stock: 5, unit: "meters" }
    ];
    await supabase.from("raw_materials").insert(defaults);
  }
}

/**
 * Decrement raw materials stock based on order item SKU shipped.
 */
export async function decrementRawMaterials(
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
  sku: string,
  quantity: number
): Promise<void> {
  const normalizedSku = sku.toLowerCase();
  const requirements: Array<{ materialName: string; qtyPerItem: number }> = [];

  if (normalizedSku.includes("a3")) {
    requirements.push(
      { materialName: "Paper A3", qtyPerItem: 1 },
      { materialName: "Tubes", qtyPerItem: 1 },
      { materialName: "Labels", qtyPerItem: 1 },
      { materialName: "Tape", qtyPerItem: 0.1 }
    );
  } else if (normalizedSku.includes("a4")) {
    requirements.push(
      { materialName: "Paper A4", qtyPerItem: 1 },
      { materialName: "Boxes A4", qtyPerItem: 1 },
      { materialName: "Labels", qtyPerItem: 1 },
      { materialName: "Tape", qtyPerItem: 0.1 }
    );
  } else {
    requirements.push(
      { materialName: "Labels", qtyPerItem: 1 }
    );
  }

  for (const req of requirements) {
    const { data: material } = await supabase
      .from("raw_materials")
      .select("id, current_stock")
      .eq("user_id", userId)
      .eq("name", req.materialName)
      .maybeSingle();

    if (material) {
      const deduction = Math.round(req.qtyPerItem * quantity * 100) / 100;
      const newStock = Math.max(0, material.current_stock - deduction);
      
      await supabase
        .from("raw_materials")
        .update({ current_stock: newStock })
        .eq("id", material.id);
    }
  }
}

// ─── Database Sync Orchestration ─────────────────────────────────────

/**
 * Upsert orders and items with financial margins into Supabase.
 */
export async function upsertOrdersToDatabase(
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
  orders: AmazonOrder[],
  orderItemsMap: Map<string, AmazonOrderItem[]>,
  financialEventsMap: Map<string, any>
): Promise<{ newCount: number; updatedCount: number; failedCount: number; errors: string[] }> {
  let newCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const order of orders) {
    try {
      // 1. Calculate fees & margins
      const events = financialEventsMap.get(order.AmazonOrderId) || null;
      const fees = calculateOrderFees(events);
      const totalAmount = order.OrderTotal?.Amount ? parseFloat(order.OrderTotal.Amount) : 0;
      const grossProfit = totalAmount - fees.commission - fees.fbaFees - fees.shippingCost;

      // Calculate total item COGS based on cost profiles
      let totalCogs = 0;
      const items = orderItemsMap.get(order.AmazonOrderId) || [];

      for (const item of items) {
        if (item.SellerSKU) {
          const { data: listing } = await supabase
            .from("listings")
            .select("cost_profile_id")
            .eq("user_id", userId)
            .eq("sku", item.SellerSKU)
            .maybeSingle();

          if (listing && listing.cost_profile_id) {
            const { data: profile } = await supabase
              .from("cost_profiles")
              .select("printing_cost, material_cost, packaging_cost, shipping_cost, labor_cost, misc_cost")
              .eq("id", listing.cost_profile_id)
              .maybeSingle();

            if (profile) {
              const unitCost = 
                parseFloat(profile.printing_cost || 0) +
                parseFloat(profile.material_cost || 0) +
                parseFloat(profile.packaging_cost || 0) +
                parseFloat(profile.shipping_cost || 0) +
                parseFloat(profile.labor_cost || 0) +
                parseFloat(profile.misc_cost || 0);

              totalCogs += unitCost * (item.QuantityOrdered || 0);
            }
          }
        }
      }

      const netProfit = grossProfit - totalCogs;

      // Check if order exists
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("user_id", userId)
        .eq("channel", "amazon")
        .eq("channel_order_id", order.AmazonOrderId)
        .maybeSingle();

      const orderRow = {
        user_id: userId,
        channel: "amazon",
        channel_order_id: order.AmazonOrderId,
        status: mapAmazonStatus(order.OrderStatus),
        total_amount: totalAmount,
        currency: order.OrderTotal?.CurrencyCode || "INR",
        purchase_date: order.PurchaseDate,
        last_update_date: order.LastUpdateDate,
        fulfillment_channel: order.FulfillmentChannel,
        marketplace_id: order.MarketplaceId,
        number_of_items_shipped: order.NumberOfItemsShipped || 0,
        number_of_items_unshipped: order.NumberOfItemsUnshipped || 0,
        commission_fees: fees.commission,
        fba_fees: fees.fbaFees,
        shipping_cost: fees.shippingCost,
        gross_profit: grossProfit,
        net_profit: netProfit
      };

      let orderId: string;

      if (existing) {
        const { error } = await supabase
          .from("orders")
          .update(orderRow)
          .eq("id", existing.id);

        if (error) {
          throw new Error(`Update failed for ${order.AmazonOrderId}: ${error.message}`);
        }
        orderId = existing.id;
        updatedCount++;
      } else {
        const { data: inserted, error } = await supabase
          .from("orders")
          .insert(orderRow)
          .select("id")
          .single();

        if (error) {
          throw new Error(`Insert failed for ${order.AmazonOrderId}: ${error.message}`);
        }
        orderId = inserted.id;
        newCount++;
      }

      // 2. Loop order items and map/upsert
      for (const item of items) {
        let listingId = null;
        if (item.SellerSKU || item.ASIN) {
          const query = supabase
            .from("listings")
            .select("id, title")
            .eq("user_id", userId);
          
          if (item.SellerSKU && item.ASIN) {
            query.or(`sku.eq."${item.SellerSKU}",asin.eq."${item.ASIN}"`);
          } else if (item.SellerSKU) {
            query.eq("sku", item.SellerSKU);
          } else {
            query.eq("asin", item.ASIN);
          }
          
          const { data: matchedListing } = await query.maybeSingle();
          if (matchedListing) {
            listingId = matchedListing.id;
            if (!matchedListing.title && item.Title) {
              await supabase
                .from("listings")
                .update({ title: item.Title })
                .eq("id", matchedListing.id);
            }
          } else {
            const newListing = {
              user_id: userId,
              channel: "amazon",
              status: "active",
              sku: item.SellerSKU || `SKU-${item.ASIN}`,
              asin: item.ASIN || null,
              title: item.Title || "Amazon Product",
              price: item.ItemPrice?.Amount ? parseFloat(item.ItemPrice.Amount) / Math.max(1, item.QuantityOrdered || 1) : 0,
              available_qty: 0,
              fulfillment_channel: "FBA",
              performance_custom_thresholds: { minSalesWinner: 20, maxRefundDead: 10 },
              price_history: [{ date: new Date().toISOString().split("T")[0], price: item.ItemPrice?.Amount ? parseFloat(item.ItemPrice.Amount) : 0 }]
            };
            const { data: inserted, error } = await supabase
              .from("listings")
              .insert(newListing)
              .select("id")
              .single();
            if (!error && inserted) {
              listingId = inserted.id;
            }
          }
        }

        const itemRow = {
          order_id: orderId,
          amazon_order_item_id: item.OrderItemId,
          seller_sku: item.SellerSKU || null,
          asin: item.ASIN || null,
          title: item.Title || null,
          quantity_ordered: Math.max(1, item.QuantityOrdered || 0),
          quantity_shipped: Math.max(1, item.QuantityShipped || 0),
          item_price: item.ItemPrice?.Amount ? parseFloat(item.ItemPrice.Amount) : 0,
          item_price_currency: item.ItemPrice?.CurrencyCode || "INR",
          listing_id: listingId,
        };

        const { data: existingItem } = await supabase
          .from("order_items")
          .select("id")
          .eq("order_id", orderId)
          .eq("amazon_order_item_id", item.OrderItemId)
          .maybeSingle();

        if (existingItem) {
          await supabase
            .from("order_items")
            .update(itemRow)
            .eq("id", existingItem.id);
        } else {
          await supabase
            .from("order_items")
            .insert(itemRow);
        }

        // Decrement raw material stocks if shipped
        if (order.OrderStatus === "Shipped" || order.OrderStatus === "delivered") {
          await decrementRawMaterials(supabase, userId, item.SellerSKU, item.QuantityOrdered || 0);
        }
      }
    } catch (e: any) {
      failedCount++;
      errors.push(e.message);
      log.error(`[OrdersSync] Failed to process order ${order.AmazonOrderId}:`, undefined, { error: e.message });
    }
  }

  return { newCount, updatedCount, failedCount, errors };
}

/**
 * Main sync orchestrator.
 */
export async function syncOrders(
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
  credentials: AmazonCredentials,
  lastUpdatedAfter?: string
): Promise<SyncSummary> {
  const startTime = Date.now();
  const summary: SyncSummary = {
    ordersFetched: 0,
    newOrdersImported: 0,
    existingOrdersUpdated: 0,
    failedOrders: 0,
    durationMs: 0,
    errors: [],
  };

  try {
    // Pre-seed raw materials if empty
    await seedRawMaterials(supabase, userId);

    // Step 1: Fetch all orders with pagination
    const { orders, accessToken, endpoint } = await fetchAllOrders(credentials, lastUpdatedAfter);
    summary.ordersFetched = orders.length;

    if (orders.length === 0) {
      summary.durationMs = Date.now() - startTime;
      log.info("[OrdersSync] No orders found in the given time range.");
      return summary;
    }

    // Step 2: Fetch order items and financial events for each order
    const orderItemsMap = new Map<string, AmazonOrderItem[]>();
    const financialEventsMap = new Map<string, any>();

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      log.info(`[OrdersSync] Fetching detail payloads for order ${i + 1}/${orders.length}: ${order.AmazonOrderId}`);

      // Fetch items
      const items = await fetchOrderItems(order.AmazonOrderId, accessToken, endpoint);
      orderItemsMap.set(order.AmazonOrderId, items);

      // Fetch finances (Referral/FBA fees)
      const finances = await fetchOrderFinancialEvents(order.AmazonOrderId, accessToken, endpoint);
      financialEventsMap.set(order.AmazonOrderId, finances);

      // Deliberate delay to respect Amazon rate limits (burst size/sec restrictions)
      if (i < orders.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2100));
      }
    }

    // Step 3: Upsert everything to the database
    log.info("[OrdersSync] Beginning database upsert...");
    const result = await upsertOrdersToDatabase(supabase, userId, orders, orderItemsMap, financialEventsMap);

    summary.newOrdersImported = result.newCount;
    summary.existingOrdersUpdated = result.updatedCount;
    summary.failedOrders = result.failedCount;
    summary.errors = result.errors;
  } catch (e: any) {
    summary.errors.push(e.message);
    log.error("[OrdersSync] Fatal sync error:", undefined, { error: e.message });
  }

  summary.durationMs = Date.now() - startTime;
  log.info(`[OrdersSync] Sync complete in ${summary.durationMs}ms.`, undefined, { summary });
  return summary;
}

/**
 * Fetch and sync FBA inventory summaries.
 */
export async function syncFbaInventory(
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
  credentials: AmazonCredentials
): Promise<{ synced: number; error?: string }> {
  try {
    const accessToken = await getAccessToken(credentials);
    const endpoint = resolveEndpoint(credentials.region, credentials.sandbox);
    
    // Call summaries endpoint
    const url = `${endpoint.spApiUrl}/fba/inventory/v1/summaries?details=true&granularityType=Marketplace&granularityId=${endpoint.marketplaceId}`;
    const res = await fetchWithBackoff(url, {
      "x-amz-access-token": accessToken,
      "Accept": "application/json"
    });
    
    if (!res.ok) {
      throw new Error(`Inventory API failed with status ${res.status}`);
    }
    
    const data = await res.json();
    const summaries = data.payload?.inventorySummaries || [];
    
    for (const item of summaries) {
      const currentStock = item.inventoryDetails?.fulfillableQuantity || 0;
      const incomingStock = (item.inventoryDetails?.inboundWorkingQuantity || 0) + 
                          (item.inventoryDetails?.inboundShippedQuantity || 0) + 
                          (item.inventoryDetails?.inboundReceivingQuantity || 0);
      
      // Upsert into inventory_planner
      await supabase.from("inventory_planner").upsert({
        user_id: userId,
        sku: item.sellerSku,
        name: item.productName || item.sellerSku,
        current_stock: currentStock,
        incoming_stock: incomingStock,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id,sku" });
    }
    
    return { synced: summaries.length };
  } catch (e: any) {
    log.error("[InventorySync] Sync error:", undefined, { error: e.message });
    return { synced: 0, error: e.message };
  }
}
