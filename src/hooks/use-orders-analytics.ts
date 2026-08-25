"use client";

import { useCallback, useEffect, useState } from "react";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

export interface OrderRecord {
  id: string;
  channel_order_id: string;
  status: string;
  total_amount: number;
  currency: string;
  purchase_date: string | null;
  last_update_date: string | null;
  fulfillment_channel: string | null;
  marketplace_id: string | null;
  buyer_name: string | null;
  shipping_address_state: string | null;
  shipping_address?: Record<string, unknown> | null;
  number_of_items_shipped: number;
  number_of_items_unshipped: number;
  net_profit: number | null;
  gross_profit: number | null;
  commission_fees: number | null;
  fba_fees: number | null;
  shipping_cost: number | null;
  profit_calculation_status: "unavailable" | "partial" | "complete";
  notes: string | null;
  version: number;
  data_source: string;
  created_at: string;
}

export interface JoinedListing {
  id: string;
  title: string;
  main_image: string | null;
  price: number;
  asin: string;
  sku: string;
  brand: string | null;
  cost_profile_id: string | null;
}

export interface OrderItemWithProduct {
  id: string;
  order_id: string;
  seller_sku: string | null;
  asin: string | null;
  title: string | null;
  quantity_ordered: number;
  quantity_shipped: number;
  item_price: number;
  listing_id?: string | null;
  channel_order_id: string;
  status: string;
  purchase_date: string | null;
  fulfillment_channel: string | null;
  marketplace_id: string | null;
  listing: JoinedListing | null;
  cogs: null;
  profit: null;
  margin: null;
}

export interface OrdersAnalytics {
  totalRevenue: number;
  totalProfit: number | null;
  profitCoverage: number;
  totalOrders: number;
  totalUnitsSold: number;
  averageOrderValue: number;
  pendingShipments: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  shippedOrders: number;
  topSellingSkus: Array<{ sku: string; title: string; unitsSold: number; revenue: number }>;
  recentOrders: OrderRecord[];
  recentOrderItems: OrderItemWithProduct[];
  ordersPerDay: Array<{ date: string; dayLabel: string; orders: number; revenue: number; profit: number | null }>;
}

export interface OrdersQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  marketplace?: string;
  start?: string;
  end?: string;
  sort?: "purchase_date" | "total_amount";
  ascending?: boolean;
}

const emptyAnalytics: OrdersAnalytics = {
  totalRevenue: 0,
  totalProfit: null,
  profitCoverage: 0,
  totalOrders: 0,
  totalUnitsSold: 0,
  averageOrderValue: 0,
  pendingShipments: 0,
  cancelledOrders: 0,
  cancelledRevenue: 0,
  shippedOrders: 0,
  topSellingSkus: [],
  recentOrders: [],
  recentOrderItems: [],
  ordersPerDay: [],
};

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function mapOrder(row: Record<string, unknown>): OrderRecord {
  const address = row.shipping_address && typeof row.shipping_address === "object"
    ? row.shipping_address as Record<string, unknown>
    : null;
  return {
    ...row,
    id: String(row.id),
    channel_order_id: String(row.channel_order_id ?? ""),
    status: String(row.status ?? "unknown"),
    total_amount: numberValue(row.total_amount),
    currency: String(row.currency ?? "INR"),
    purchase_date: typeof row.purchase_date === "string" ? row.purchase_date : null,
    last_update_date: typeof row.last_update_date === "string" ? row.last_update_date : null,
    fulfillment_channel: typeof row.fulfillment_channel === "string" ? row.fulfillment_channel : null,
    marketplace_id: typeof row.marketplace_id === "string" ? row.marketplace_id : null,
    buyer_name: typeof row.buyer_name === "string" ? row.buyer_name : null,
    shipping_address_state: typeof address?.StateOrRegion === "string" ? address.StateOrRegion : null,
    shipping_address: address,
    number_of_items_shipped: numberValue(row.number_of_items_shipped),
    number_of_items_unshipped: numberValue(row.number_of_items_unshipped),
    net_profit: row.net_profit == null ? null : numberValue(row.net_profit),
    gross_profit: row.gross_profit == null ? null : numberValue(row.gross_profit),
    commission_fees: row.commission_fees == null ? null : numberValue(row.commission_fees),
    fba_fees: row.fba_fees == null ? null : numberValue(row.fba_fees),
    shipping_cost: row.shipping_cost == null ? null : numberValue(row.shipping_cost),
    profit_calculation_status: ["partial", "complete"].includes(String(row.profit_calculation_status))
      ? String(row.profit_calculation_status) as "partial" | "complete"
      : "unavailable",
    notes: typeof row.notes === "string" ? row.notes : null,
    version: Math.max(1, numberValue(row.version)),
    data_source: String(row.data_source ?? "unknown"),
    created_at: String(row.created_at ?? ""),
  };
}

function mapItem(row: Record<string, any>): OrderItemWithProduct {
  const relation = Array.isArray(row.listing) ? row.listing[0] : row.listing;
  return {
    ...row,
    id: String(row.id),
    order_id: String(row.order_id),
    seller_sku: typeof row.seller_sku === "string" ? row.seller_sku : null,
    asin: typeof row.asin === "string" ? row.asin : null,
    title: typeof row.title === "string" ? row.title : null,
    quantity_ordered: numberValue(row.quantity_ordered),
    quantity_shipped: numberValue(row.quantity_shipped),
    item_price: numberValue(row.item_price),
    channel_order_id: String(row.channel_order_id ?? "—"),
    status: String(row.status ?? "—"),
    purchase_date: typeof row.purchase_date === "string" ? row.purchase_date : null,
    fulfillment_channel: typeof row.fulfillment_channel === "string" ? row.fulfillment_channel : null,
    marketplace_id: typeof row.marketplace_id === "string" ? row.marketplace_id : null,
    listing: relation ?? null,
    cogs: null,
    profit: null,
    margin: null,
  };
}

export function useOrdersAnalytics(userId: string | undefined, query: OrdersQuery = {}) {
  const workspaceId = useAuth((state) => state.user?.workspaceId);
  const [analytics, setAnalytics] = useState<OrdersAnalytics>(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  const search = query.search?.trim() ?? "";
  const status = query.status ?? "";
  const marketplace = query.marketplace ?? "";
  const start = query.start ?? "";
  const end = query.end ?? "";
  const sort = query.sort ?? "purchase_date";
  const ascending = query.ascending ?? false;

  const fetchOrders = useCallback(async () => {
    if (!userId) {
      setAnalytics(emptyAnalytics);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, ascending: String(ascending) });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (marketplace) params.set("marketplace", marketplace);
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      const response = await sellerplusApiFetch(`/api/orders?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Orders are unavailable.");

      const rawAnalytics = payload.analytics ?? {};
      const mappedOrders = (payload.data ?? []).map(mapOrder);
      const mappedItems = (payload.items ?? []).map(mapItem);
      setAnalytics({
        totalRevenue: numberValue(rawAnalytics.totalRevenue),
        totalProfit: rawAnalytics.totalProfit == null ? null : numberValue(rawAnalytics.totalProfit),
        profitCoverage: numberValue(rawAnalytics.profitCoverage),
        totalOrders: numberValue(rawAnalytics.totalOrders),
        totalUnitsSold: numberValue(rawAnalytics.totalUnitsSold),
        averageOrderValue: numberValue(rawAnalytics.averageOrderValue),
        pendingShipments: numberValue(rawAnalytics.pendingShipments),
        cancelledOrders: numberValue(rawAnalytics.cancelledOrders),
        cancelledRevenue: numberValue(rawAnalytics.cancelledRevenue),
        shippedOrders: numberValue(rawAnalytics.shippedOrders),
        topSellingSkus: (rawAnalytics.topSellingSkus ?? []).map((item: Record<string, unknown>) => ({
          sku: String(item.sku ?? "Unknown"), title: String(item.title ?? item.sku ?? "Unknown"),
          unitsSold: numberValue(item.unitsSold), revenue: numberValue(item.revenue),
        })),
        ordersPerDay: (rawAnalytics.ordersPerDay ?? []).map((item: Record<string, unknown>) => ({
          date: String(item.date),
          dayLabel: new Date(`${String(item.date)}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" }),
          orders: numberValue(item.orders), revenue: numberValue(item.revenue),
          profit: item.profit == null ? null : numberValue(item.profit),
        })),
        recentOrders: mappedOrders,
        recentOrderItems: mappedItems,
      });
      setTotal(numberValue(payload.pagination?.total));
      setLastSyncedAt(payload.freshness?.last_succeeded_at ?? null);
    } catch (caught) {
      setAnalytics(emptyAnalytics);
      setTotal(0);
      setError(caught instanceof Error ? caught.message : "Orders are unavailable.");
    } finally {
      setLoading(false);
    }
  }, [userId, workspaceId, page, pageSize, search, status, marketplace, start, end, sort, ascending]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchOrders(), 250);
    return () => window.clearTimeout(timeout);
  }, [fetchOrders]);

  return { analytics, loading, error, lastSyncedAt, total, page, pageSize, refetch: fetchOrders };
}
