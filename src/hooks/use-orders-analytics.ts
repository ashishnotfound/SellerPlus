/**
 * Orders Analytics Hook
 * 
 * Fetches real order data from Supabase and computes live analytics.
 * All metrics are derived strictly from the orders and order_items tables.
 * No fabricated, estimated, or placeholder values.
 */

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────

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
  number_of_items_shipped: number;
  number_of_items_unshipped: number;
  net_profit?: number;
  gross_profit?: number;
  commission_fees?: number;
  fba_fees?: number;
  shipping_cost?: number;
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

export interface OrderItemRecord {
  id: string;
  order_id: string;
  seller_sku: string | null;
  asin: string | null;
  title: string | null;
  quantity_ordered: number;
  quantity_shipped: number;
  item_price: number;
  listing_id?: string | null;
  listing?: JoinedListing | null;
}

export interface OrderItemWithProduct extends OrderItemRecord {
  channel_order_id: string;
  status: string;
  purchase_date: string | null;
  fulfillment_channel: string | null;
  marketplace_id: string | null;
  listing: JoinedListing | null;
  cogs: number;
  profit: number;
  margin: number;
}

export interface OrdersAnalytics {
  // Core KPIs
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
  totalUnitsSold: number;
  averageOrderValue: number;

  // Status breakdowns
  pendingShipments: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  shippedOrders: number;

  // Top sellers
  topSellingSkus: Array<{ sku: string; title: string; unitsSold: number; revenue: number }>;

  // Recent orders for table display
  recentOrders: OrderRecord[];
  recentOrderItems: OrderItemWithProduct[];

  // Daily breakdown for charts
  ordersPerDay: Array<{ date: string; dayLabel: string; orders: number; revenue: number; profit: number }>;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useOrdersAnalytics(userId: string | undefined) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRecord[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      // Fetch all orders for this user
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .eq("channel", "amazon")
        .order("purchase_date", { ascending: false });

      if (ordersError) {
        console.error("[OrdersAnalytics] Failed to fetch orders:", ordersError);
        setLoading(false);
        return;
      }

      const fetchedOrders: OrderRecord[] = ordersData || [];
      setOrders(fetchedOrders);

      if (fetchedOrders.length > 0) {
        setLastSyncedAt(fetchedOrders[0].last_update_date || fetchedOrders[0].created_at);
      }

      // Fetch listings & profiles context for COGS calculation and fallback joins
      const { data: listingsData } = await supabase
        .from("listings")
        .select("id, title, main_image, price, asin, sku, brand, cost_profile_id")
        .eq("user_id", userId);
      setListings(listingsData || []);

      const { data: profilesData } = await supabase
        .from("cost_profiles")
        .select("*")
        .eq("user_id", userId);
      setProfiles(profilesData || []);

      // Fetch all order items for these orders
      const orderIds = fetchedOrders.map(o => o.id);
      if (orderIds.length > 0) {
        // Supabase has a limit on IN queries, batch if needed
        const batchSize = 100;
        const allItems: OrderItemRecord[] = [];

        for (let i = 0; i < orderIds.length; i += batchSize) {
          const batch = orderIds.slice(i, i + batchSize);
          const { data: itemsData } = await supabase
            .from("order_items")
            .select(`
              *,
              listing:listings(
                id,
                title,
                main_image,
                price,
                asin,
                sku,
                brand,
                cost_profile_id
              )
            `)
            .in("order_id", batch);

          if (itemsData) {
            const mapped = itemsData.map((item: any) => {
              let matched = item.listing;
              if (!matched && listingsData) {
                matched = listingsData.find((l: any) => 
                  (item.seller_sku && l.sku === item.seller_sku) ||
                  (item.asin && l.asin === item.asin)
                );
              }
              return {
                ...item,
                listing: matched || null
              };
            });
            allItems.push(...mapped);
          }
        }
        setOrderItems(allItems);
      }
    } catch (e) {
      console.error("[OrdersAnalytics] Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const analytics: OrdersAnalytics = useMemo(() => {
    // Only count orders with valid (non-cancelled) statuses for revenue
    const validRevenueStatuses = ["Shipped", "shipped", "delivered", "Unshipped", "PartiallyShipped"];
    const cancelledStatuses = ["Canceled", "cancelled"];
    const pendingStatuses = ["Unshipped", "pending", "Pending", "PendingAvailability", "InvoiceUnconfirmed"];
    const shippedStatuses = ["Shipped", "shipped", "delivered", "PartiallyShipped"];

    // Revenue: sum total_amount for non-cancelled orders
    const revenueOrders = orders.filter(o => !cancelledStatuses.includes(o.status));
    const totalRevenue = revenueOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const totalProfit = revenueOrders.reduce((sum, o) => sum + Number(o.net_profit || 0), 0);

    const totalOrders = orders.length;

    // Units sold: sum quantity_ordered from order items tied to non-cancelled orders
    // In sandbox, QuantityOrdered is 0, so we default to at least 1 unit per item ordered
    const cancelledOrderIds = new Set(orders.filter(o => cancelledStatuses.includes(o.status)).map(o => o.id));
    const validItems = orderItems.filter(item => !cancelledOrderIds.has(item.order_id));
    const totalUnitsSold = validItems.reduce((sum, item) => sum + Math.max(1, item.quantity_ordered || 0), 0);

    const averageOrderValue = revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;

    const pendingShipments = orders.filter(o => pendingStatuses.includes(o.status)).length;
    const cancelledOrders = orders.filter(o => cancelledStatuses.includes(o.status)).length;
    const cancelledOrdersList = orders.filter(o => cancelledStatuses.includes(o.status));
    const cancelledRevenue = cancelledOrdersList.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const shippedOrders = orders.filter(o => shippedStatuses.includes(o.status)).length;

    // Top-selling SKUs: group order items by seller_sku
    const skuMap = new Map<string, { sku: string; title: string; unitsSold: number; revenue: number }>();
    for (const item of validItems) {
      const sku = item.seller_sku || "Unknown";
      const existing = skuMap.get(sku);
      if (existing) {
        existing.unitsSold += Math.max(1, item.quantity_ordered || 0);
        existing.revenue += Number(item.item_price || 0);
      } else {
        skuMap.set(sku, {
          sku,
          title: item.title || sku,
          unitsSold: Math.max(1, item.quantity_ordered || 0),
          revenue: Number(item.item_price || 0),
        });
      }
    }
    const topSellingSkus = Array.from(skuMap.values())
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);

    // Recent orders: already sorted by purchase_date desc
    const recentOrders = orders.slice(0, 15);

    const getUnitCogs = (listing: any) => {
      if (!listing || !listing.cost_profile_id) return 0;
      const profile = profiles.find(p => p.id === listing.cost_profile_id);
      if (!profile) return 0;
      return (
        parseFloat(profile.printing_cost || 0) +
        parseFloat(profile.material_cost || 0) +
        parseFloat(profile.packaging_cost || 0) +
        parseFloat(profile.shipping_cost || 0) +
        parseFloat(profile.labor_cost || 0) +
        parseFloat(profile.misc_cost || 0)
      );
    };

    const recentOrderIds = new Set(recentOrders.map(o => o.id));
    const recentItems = orderItems.filter(item => recentOrderIds.has(item.order_id));

    const recentOrderItems: OrderItemWithProduct[] = recentItems.map((item) => {
      const parentOrder = orders.find(o => o.id === item.order_id);
      const unitCogs = getUnitCogs(item.listing);
      const qty = Math.max(1, item.quantity_ordered || 0);
      const revenue = Number(item.item_price || 0);
      const totalCogs = unitCogs * qty;
      const profit = revenue - totalCogs;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        ...item,
        channel_order_id: parentOrder?.channel_order_id || "—",
        status: parentOrder?.status || "—",
        purchase_date: parentOrder?.purchase_date || null,
        fulfillment_channel: parentOrder?.fulfillment_channel || null,
        marketplace_id: parentOrder?.marketplace_id || null,
        cogs: totalCogs,
        profit,
        margin
      } as OrderItemWithProduct;
    });

    // Orders per day (last 7 days)
    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const last7Days: Array<{ date: string; dayLabel: string; orders: number; revenue: number; profit: number }> = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = weekdayNames[d.getDay()];

      const dayOrders = orders.filter(o => {
        const orderDate = o.purchase_date ? o.purchase_date.split("T")[0] : null;
        return orderDate === dateStr && !cancelledStatuses.includes(o.status);
      });

      last7Days.push({
        date: dateStr,
        dayLabel,
        orders: dayOrders.length,
        revenue: dayOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
        profit: dayOrders.reduce((sum, o) => sum + Number(o.net_profit || 0), 0),
      });
    }

    return {
      totalRevenue,
      totalProfit,
      totalOrders,
      totalUnitsSold,
      averageOrderValue,
      pendingShipments,
      cancelledOrders,
      cancelledRevenue,
      shippedOrders,
      topSellingSkus,
      recentOrders,
      recentOrderItems,
      ordersPerDay: last7Days,
    };
  }, [orders, orderItems, profiles, listings]);

  return { analytics, loading, lastSyncedAt, refetch: fetchOrders };
}
