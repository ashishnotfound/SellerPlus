import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";

export interface AdsSummary {
  totalSpend: number;
  totalSales: number;
  totalImpressions: number;
  totalClicks: number;
  campaignCount: number;
  activeCampaignCount: number;
  dataAvailable: boolean;
  earliestDate: string | null;
  latestDate: string | null;
  sourceUpdatedAt: string | null;
  dataSource: "amazon_ads_api_v3_daily";
}

export interface OrdersSummary {
  totalRevenue: number;
  totalOrders: number;
  totalCommissionFees: number;
  totalFbaFees: number;
  totalShippingCost: number;
  orderStatusCounts: Record<string, number>;
  totalNetProfit: number | null;
  profitCoverage: number;
  topProduct: { sku: string; title: string; units: number; revenue: number } | null;
  sourceUpdatedAt: string | null;
  dataSource: "amazon_sp_api";
}

export interface InventorySummary {
  totalItems: number;
  lowStockItems: number;
  outOfStockItems: number;
  sourceUpdatedAt: string | null;
  dataSource: "amazon_sp_api_report";
}

export interface CogsSummary {
  totalCogs: number | null;
  listingsWithCostProfile: number;
  coveredUnits: number;
  totalUnits: number;
  coverage: number;
  dataSource: "seller_entered_cost_profiles";
}

export interface BusinessSummary {
  dataWindow: { since: string; until: string };
  ads: AdsSummary;
  orders: OrdersSummary;
  inventory: InventorySummary;
  cogs: CogsSummary;
}

const finite = z.coerce.number().finite().default(0);
const summarySchema = z.object({
  dataWindow: z.object({ since: z.string(), until: z.string() }),
  ads: z.object({
    totalSpend: finite,
    totalSales: finite,
    totalImpressions: finite,
    totalClicks: finite,
    campaignCount: finite,
    activeCampaignCount: finite,
    dataAvailable: z.boolean().default(false),
    earliestDate: z.string().nullable().default(null),
    latestDate: z.string().nullable().default(null),
    sourceUpdatedAt: z.string().nullable().default(null),
    dataSource: z.literal("amazon_ads_api_v3_daily"),
  }),
  orders: z.object({
    totalRevenue: finite,
    totalOrders: finite,
    totalCommissionFees: finite,
    totalFbaFees: finite,
    totalShippingCost: finite,
    orderStatusCounts: z.record(z.coerce.number().finite()).default({}),
    totalNetProfit: z.coerce.number().finite().nullable().default(null),
    profitCoverage: finite,
    topProduct: z.object({ sku: z.string(), title: z.string(), units: finite, revenue: finite }).nullable().default(null),
    sourceUpdatedAt: z.string().nullable().default(null),
    dataSource: z.literal("amazon_sp_api"),
  }),
  inventory: z.object({
    totalItems: finite,
    lowStockItems: finite,
    outOfStockItems: finite,
    sourceUpdatedAt: z.string().nullable().default(null),
    dataSource: z.literal("amazon_sp_api_report"),
  }),
  cogs: z.object({
    totalCogs: z.coerce.number().finite().nullable().default(null),
    listingsWithCostProfile: finite,
    coveredUnits: finite,
    totalUnits: finite,
    coverage: finite,
    dataSource: z.literal("seller_entered_cost_profiles"),
  }),
});

/**
 * Reads a single PostgreSQL aggregation result. No raw order, listing, or
 * campaign collections cross the application boundary as tenant data grows.
 */
export class BIRepository {
  static async getBusinessSummary(
    workspaceId: string,
    since = new Date(Date.now() - 30 * 86_400_000),
    until = new Date(),
  ): Promise<BusinessSummary> {
    if (!workspaceId) throw new Error("BIRepository.getBusinessSummary: workspaceId is required");
    if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since >= until) {
      throw new Error("BIRepository.getBusinessSummary: a valid data window is required");
    }
    if (until.getTime() - since.getTime() > 366 * 86_400_000) {
      throw new Error("BIRepository.getBusinessSummary: data windows are limited to 366 days");
    }
    const { data, error } = await getAdminClient().rpc("get_workspace_bi_summary_range", {
      p_workspace_id: workspaceId,
      p_since: since.toISOString(),
      p_until: until.toISOString(),
    });
    if (error) throw new Error(`Business summary unavailable: ${error.message}`);
    return summarySchema.parse(data) as BusinessSummary;
  }
}
