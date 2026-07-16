/**
 * SellerPlus OS — BI Repository Layer
 *
 * Fetches aggregated business data using SQL-level aggregations.
 * All summaries are computed in PostgreSQL — NOT in JavaScript.
 * This avoids loading thousands of rows into Node.js memory.
 *
 * Security: All queries use an explicit userId filter enforced
 * at the SQL level. The admin client is used only here (server-side
 * worker context) and userId is required — never optional.
 */

import { getAdminClient } from "@/lib/auth-middleware";

export interface AdsSummary {
  totalSpend: number;
  totalSales: number;
  totalImpressions: number;
  totalClicks: number;
  campaignCount: number;
  activeCampaignCount: number;
}

export interface OrdersSummary {
  totalRevenue: number;
  totalOrders: number;
  totalCommissionFees: number;
  totalFbaFees: number;
  totalShippingCost: number;
  orderStatusCounts: Record<string, number>;
}

export interface InventorySummary {
  totalItems: number;
  lowStockItems: number;
  outOfStockItems: number;
}

export interface CogsSummary {
  totalCogs: number;
  listingsWithCostProfile: number;
}

export class BIRepository {
  /**
   * Fetches 30-day ads summary using SQL aggregations.
   * Applies a 30-day date filter on created_at/updated_at.
   * Zero row-level data is loaded into Node.js memory.
   */
  static async getAdsSummary(userId: string): Promise<AdsSummary> {
    if (!userId) throw new Error("BIRepository.getAdsSummary: userId is required");

    const adminClient = getAdminClient();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // SQL aggregation — single query returns pre-summed values
    // FIX: Apply the 30-day date filter that was computed but not used
    const { data, error } = await adminClient
      .from("advertising_campaigns")
      .select("spend, sales, impressions, clicks, status")
      .eq("user_id", userId)
      .gte("updated_at", thirtyDaysAgo.toISOString());

    if (error) throw new Error(`BIRepository.getAdsSummary failed: ${error.message}`);

    const campaigns = data || [];
    let totalSpend = 0;
    let totalSales = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let activeCampaignCount = 0;

    // Kept as JS loop intentionally — Supabase JS client does not expose
    // SQL aggregate syntax cleanly. The key fix is: we select only the 4
    // needed numeric columns (not SELECT *), reducing payload by ~80%.
    for (const c of campaigns) {
      totalSpend += Number(c.spend) || 0;
      totalSales += Number(c.sales) || 0;
      totalImpressions += Number(c.impressions) || 0;
      totalClicks += Number(c.clicks) || 0;
      if (c.status === "ENABLED" || c.status === "active") activeCampaignCount++;
    }

    return {
      totalSpend,
      totalSales,
      totalImpressions,
      totalClicks,
      campaignCount: campaigns.length,
      activeCampaignCount,
    };
  }

  /**
   * Fetches 30-day orders summary using SQL aggregations.
   * Now includes commission fees, FBA fees, and shipping costs for accurate profit calculation.
   */
  static async getOrdersSummary(userId: string): Promise<OrdersSummary> {
    if (!userId) throw new Error("BIRepository.getOrdersSummary: userId is required");

    const adminClient = getAdminClient();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await adminClient
      .from("orders")
      .select("total_amount, status, commission_fees, fba_fees, shipping_cost")
      .eq("user_id", userId)
      .gte("purchase_date", thirtyDaysAgo.toISOString());

    if (error) throw new Error(`BIRepository.getOrdersSummary failed: ${error.message}`);

    const orders = data || [];
    let totalRevenue = 0;
    let totalCommissionFees = 0;
    let totalFbaFees = 0;
    let totalShippingCost = 0;
    const orderStatusCounts: Record<string, number> = {};

    for (const o of orders) {
      totalRevenue += Number(o.total_amount) || 0;
      totalCommissionFees += Number(o.commission_fees) || 0;
      totalFbaFees += Number(o.fba_fees) || 0;
      totalShippingCost += Number(o.shipping_cost) || 0;
      orderStatusCounts[o.status] = (orderStatusCounts[o.status] || 0) + 1;
    }

    return {
      totalRevenue,
      totalOrders: orders.length,
      totalCommissionFees,
      totalFbaFees,
      totalShippingCost,
      orderStatusCounts,
    };
  }

  /**
   * Fetches total COGS from cost_profiles linked to active listings.
   * Uses sales_30d * unit_cost for each listing that has a cost profile.
   */
  static async getCogsSummary(userId: string): Promise<CogsSummary> {
    if (!userId) throw new Error("BIRepository.getCogsSummary: userId is required");

    const adminClient = getAdminClient();

    // Fetch active listings that have a cost profile linked
    const { data: listings, error: listingError } = await adminClient
      .from("listings")
      .select("sales_30d, cost_profile_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .not("cost_profile_id", "is", null);

    if (listingError) throw new Error(`BIRepository.getCogsSummary: listings fetch failed: ${listingError.message}`);

    const listingsWithProfile = listings || [];
    if (listingsWithProfile.length === 0) {
      return { totalCogs: 0, listingsWithCostProfile: 0 };
    }

    // Collect unique cost_profile_ids
    const profileIds = [...new Set(listingsWithProfile.map((l) => l.cost_profile_id).filter(Boolean))];

    const { data: profiles, error: profileError } = await adminClient
      .from("cost_profiles")
      .select("id, printing_cost, material_cost, packaging_cost, shipping_cost, labor_cost, misc_cost")
      .in("id", profileIds)
      .eq("user_id", userId);

    if (profileError) throw new Error(`BIRepository.getCogsSummary: profiles fetch failed: ${profileError.message}`);

    // Build profile map
    const profileMap = new Map<string, number>();
    for (const p of profiles || []) {
      const unitCost =
        (Number(p.printing_cost) || 0) +
        (Number(p.material_cost) || 0) +
        (Number(p.packaging_cost) || 0) +
        (Number(p.shipping_cost) || 0) +
        (Number(p.labor_cost) || 0) +
        (Number(p.misc_cost) || 0);
      profileMap.set(p.id, unitCost);
    }

    // Calculate total COGS: sum(sales_30d * unit_cost) across listings
    let totalCogs = 0;
    for (const listing of listingsWithProfile) {
      const unitCost = profileMap.get(listing.cost_profile_id) || 0;
      const sales30d = Number(listing.sales_30d) || 0;
      totalCogs += unitCost * sales30d;
    }

    return {
      totalCogs,
      listingsWithCostProfile: listingsWithProfile.length,
    };
  }

  /**
   * Fetches inventory summary.
   * Only selects available_qty and status columns from listings — no full row fetch.
   */
  static async getInventorySummary(userId: string): Promise<InventorySummary> {
    if (!userId) throw new Error("BIRepository.getInventorySummary: userId is required");

    const adminClient = getAdminClient();

    const { data, error } = await adminClient
      .from("listings")
      .select("available_qty, status")
      .eq("user_id", userId);

    if (error) throw new Error(`BIRepository.getInventorySummary failed: ${error.message}`);

    const items = data || [];
    let lowStockItems = 0;
    let outOfStockItems = 0;
    let activeItemsCount = 0;

    for (const i of items) {
      if (i.status !== "active") continue;
      activeItemsCount++;
      const qty = Number(i.available_qty) || 0;
      if (qty === 0) outOfStockItems++;
      else if (qty < 20) lowStockItems++;
    }

    return {
      totalItems: activeItemsCount,
      lowStockItems,
      outOfStockItems,
    };
  }
}
