"use client";

import { create } from "zustand";
import { useToastStore } from "@/hooks/use-toast-store";
import { createCsv } from "@/lib/csv";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

export type DateRangePreset = "today" | "yesterday" | "last_7d" | "last_30d" | "this_month" | "last_month" | "lifetime";

export interface WidgetLayout {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FinancialSummary {
  revenue: number | null;
  netProfit: number | null;
  grossProfit: number | null;
  cogs: number | null;
  shippingCost: number | null;
  amazonFees: number | null;
  adSpend: number | null;
  adSales: number | null;
  refundCosts: number | null;
  margin: number | null;
  roi: number | null;
  ordersCount: number | null;
  unitsSold: number | null;
  refundCount: number | null;
}

export interface ProductSummary {
  sku: string;
  asin: string;
  name: string;
  revenue: number | null;
  unitsSold: number | null;
  cogs: number | null;
  fees: number | null;
  netProfit: number | null;
  margin: number | null;
  roi: number | null;
  refundRate: number | null;
  main_image?: string | null;
  marketplace?: string | null;
}

export interface AdPerformanceSummary {
  adSpend: number | null;
  adSales: number | null;
  acos: number | null;
  tacos: number | null;
  roas: number | null;
  cpc: number | null;
  ctr: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

export interface PPCLog {
  campaign: string;
  spend: number;
  sales: number;
  impressions: number;
  clicks: number;
  conversions: number;
  acos: number;
  roas: number;
  ctr: number;
  cpc: number;
}

export interface InventoryItem {
  sku: string;
  name: string;
  currentStock: number;
  incomingStock: number;
  velocity: number | null;
  daysUntilStockout: number | null;
  recommendation: number | null;
  status: "green" | "yellow" | "red";
  main_image?: string | null;
}

export interface RefundLog {
  orderId: string;
  sku: string;
  name: string;
  amount: number;
  date: string;
  reason: string;
}

export interface SystemAlert {
  id: string;
  type: "low_stock" | "sales_drop" | "high_refunds" | "profit_decrease" | "out_of_stock_risk";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface FinancialLogEntry {
  date: string;
  revenue: number;
  ordersCount: number;
  unitsSold: number;
  cogs: number | null;
  cogsCoverage: number;
  shippingCost: number | null;
  amazonFees: number | null;
  adSpend: number | null;
  adSales: number | null;
  refundCosts: number | null;
  refundCount: number | null;
  contributionProfit: number | null;
  calculationStatus: "incomplete";
  sourceUpdatedAt: string | null;
  limitations: string[];
}

interface AnalyticsStore {
  dateRange: DateRangePreset;
  searchQuery: string;
  productFilter: string;
  widgets: WidgetLayout[];
  isEditingWidgets: boolean;
  alerts: SystemAlert[];
  unreadAlertCount: number;
  activeScopeKey: string | null;
  loading: boolean;
  
  financialLogs: FinancialLogEntry[];
  
  productLogs: Array<{
    sku: string;
    asin: string;
    name: string;
    salesCount: number | null;
    refundCount: number | null;
    price?: number | null;
    revenue?: number | null;
    main_image?: string | null;
    marketplace?: string | null;
    cogs?: number | null;
    fees?: number | null;
    netProfit?: number | null;
    margin?: number | null;
    roi?: number | null;
  }>;

  ppcLogs: PPCLog[];
  refundLogs: RefundLog[];
  inventoryLogs: InventoryItem[];

  loadAnalyticsData: (userId: string) => Promise<void>;
  setDateRange: (range: DateRangePreset) => void;
  setSearchQuery: (q: string) => void;
  setProductFilter: (sku: string) => void;
  setEditingWidgets: (edit: boolean) => void;
  updateWidgetLayout: (id: string, layout: Partial<WidgetLayout>) => Promise<void>;
  saveWidgetLayout: (silent?: boolean) => Promise<void>;
  resetWidgetLayout: () => Promise<void>;
  markAlertsAsRead: () => Promise<void>;
  
  getSummary: () => FinancialSummary;
  getPrevSummary: () => FinancialSummary;
  getProductAnalytics: () => ProductSummary[];
  getPpcSummary: () => AdPerformanceSummary;
  getInventoryPlanner: () => InventoryItem[];
  getRefundSummary: () => {
    refundCount: number | null;
    refundValue: number | null;
    refundRate: number | null;
    topRefunded: Array<{ sku: string; name: string; count: number; rate: number }>;
  };
  getDailyPerformanceLogs: () => Array<{
    date: string;
    revenue: number;
    netProfit: number | null;
    adSpend: number | null;
    adSales: number | null;
    refundCosts: number | null;
    ordersCount: number;
  }>;

  exportToCSV: (headers: string[], rows: any[][], filename: string) => void;
}

const DEFAULT_WIDGETS: WidgetLayout[] = [
  { id: "today_profit", title: "Today's Profit", x: 0, y: 0, w: 1, h: 1 },
  { id: "revenue", title: "Revenue", x: 1, y: 0, w: 1, h: 1 },
  { id: "orders", title: "Orders", x: 2, y: 0, w: 1, h: 1 },
  { id: "units_sold", title: "Units Sold", x: 3, y: 0, w: 1, h: 1 },
  { id: "top_product", title: "Top Product", x: 0, y: 1, w: 2, h: 1 },
  { id: "lowest_stock", title: "Lowest Stock SKU", x: 2, y: 1, w: 1, h: 1 },
  { id: "ad_spend", title: "Ad Spend", x: 3, y: 1, w: 1, h: 1 },
  { id: "profit_margin", title: "Profit Margin", x: 0, y: 2, w: 4, h: 1 },
];

async function analyticsRequest(init?: RequestInit) {
  const response = await sellerplusApiFetch("/api/analytics/overview", init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Analytics are unavailable.");
  return payload;
}

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => {


  return {
    dateRange: "last_30d",
    searchQuery: "",
    productFilter: "all",
    widgets: DEFAULT_WIDGETS,
    isEditingWidgets: false,
    alerts: [],
    unreadAlertCount: 0,
    activeScopeKey: null,
    loading: false,
    financialLogs: [],
    productLogs: [],
    ppcLogs: [],
    refundLogs: [],
    inventoryLogs: [],

    loadAnalyticsData: async (userId) => {
      const workspaceId = useAuth.getState().user?.workspaceId;
      if (!workspaceId) return;
      const scopeKey = `${userId}:${workspaceId}`;
      if (get().financialLogs.length > 0 && get().activeScopeKey === scopeKey) {
        return;
      }
      set({ activeScopeKey: scopeKey, loading: true });

      try {
        const payload = await analyticsRequest();
        const data = payload.data ?? {};
        const layouts = data.layouts ?? [];
        if (layouts && layouts.length > 0) {
          const mapped = layouts.map((l: any) => ({
            id: l.widget_id,
            title: DEFAULT_WIDGETS.find(w => w.id === l.widget_id)?.title || l.widget_id,
            x: l.x_pos,
            y: l.y_pos,
            w: l.col_span,
            h: l.row_span
          }));
          set({ widgets: mapped });
        } else {
          set({ widgets: DEFAULT_WIDGETS });
        }

        const finData = data.financialLogs ?? [];
        if (finData && finData.length > 0) {
          const mappedFin: FinancialLogEntry[] = finData.map((f: any) => ({
            date: f.date,
            revenue: Number(f.revenue),
            ordersCount: Number(f.ordersCount),
            unitsSold: Number(f.unitsSold),
            cogs: nullableNumber(f.cogs),
            cogsCoverage: Number(f.cogsCoverage),
            shippingCost: nullableNumber(f.shippingCost),
            amazonFees: nullableNumber(f.amazonFees),
            adSpend: nullableNumber(f.adSpend),
            adSales: nullableNumber(f.adSales),
            refundCosts: nullableNumber(f.refundCosts),
            refundCount: nullableNumber(f.refundCount),
            contributionProfit: nullableNumber(f.contributionProfit),
            calculationStatus: f.calculationStatus,
            sourceUpdatedAt: f.sourceUpdatedAt,
            limitations: f.limitations,
          }));
          set({ financialLogs: mappedFin });
        } else {
          set({ financialLogs: [] });
        }

        const alertsDb = data.alerts ?? [];
        if (alertsDb && alertsDb.length > 0) {
          const mappedAlerts: SystemAlert[] = alertsDb.map((a: any) => ({
            id: a.id,
            type: a.type,
            title: a.title,
            message: a.message,
            isRead: a.is_read,
            createdAt: a.created_at
          }));
          set({ alerts: mappedAlerts, unreadAlertCount: mappedAlerts.filter(a => !a.isRead).length });
        } else {
          set({ alerts: [], unreadAlertCount: 0 });
        }

        const listDb = data.listings ?? [];

        if (listDb && listDb.length > 0) {
          const mappedInventory: InventoryItem[] = listDb.map((l: any) => {
            const velocity = l.sales_30d !== null && l.sales_30d !== undefined ? l.sales_30d / 30 : null;
            const daysUntilStockout = (velocity !== null && velocity > 0) ? Math.ceil((l.available_qty || 0) / velocity) : null;
            
            let recommendation: number | null = null;
            if (daysUntilStockout !== null && daysUntilStockout <= 15) {
              if (l.reorder_qty !== null && l.reorder_qty !== undefined) {
                recommendation = Math.max(0, l.reorder_qty - (l.incoming_qty || 0));
              }
            }
            
            let status: "green" | "yellow" | "red" = "green";
            if (l.available_qty === 0 || (daysUntilStockout !== null && daysUntilStockout <= 3)) {
              status = "red";
            } else if (daysUntilStockout !== null && daysUntilStockout <= 12) {
              status = "yellow";
            }

            return {
              sku: l.sku,
              name: l.title,
              currentStock: l.available_qty || 0,
              incomingStock: l.incoming_qty || 0,
              velocity: velocity,
              daysUntilStockout: daysUntilStockout,
              recommendation: recommendation,
              status: status,
              main_image: l.main_image
            };
          });
          set({ inventoryLogs: mappedInventory });

          const mappedProductLogs = listDb.map((l: any) => {
            const profile = Array.isArray(l.cost_profiles) ? l.cost_profiles[0] : l.cost_profiles;
            const unitCogs: number | null = profile
              ? (parseFloat(profile.printing_cost || 0) +
                 parseFloat(profile.material_cost || 0) +
                 parseFloat(profile.packaging_cost || 0) +
                 parseFloat(profile.shipping_cost || 0) +
                 parseFloat(profile.labor_cost || 0) +
                 parseFloat(profile.misc_cost || 0))
              : null;

            const salesCount = l.units_sold_30d !== null ? Number(l.units_sold_30d) : null;
            const revenue = l.revenue_30d !== null ? Number(l.revenue_30d) : null;
            const totalCogs = unitCogs !== null && salesCount !== null ? unitCogs * salesCount : null;

            return {
              sku: l.sku,
              asin: l.asin || "",
              name: l.title,
              salesCount: salesCount,
              refundCount: null,
              price: Number(l.price || 0),
              revenue: revenue,
              main_image: l.main_image,
              marketplace: l.marketplace_id || null,
              cogs: totalCogs,
              fees: null,
              netProfit: null,
              margin: null,
              roi: null
            };
          });
          set({ productLogs: mappedProductLogs });
        } else {
          set({ inventoryLogs: [], productLogs: [] });
        }
        if (data.catalogTruncated) {
          useToastStore.getState().info("Catalog view bounded", `Analytics loaded the top ${listDb.length} of ${data.catalogTotal} active listings. Use Catalog for the complete server-paginated set.`);
        }
      } catch (e) {
        set({ financialLogs: [], productLogs: [], inventoryLogs: [], alerts: [], unreadAlertCount: 0 });
        useToastStore.getState().error("Analytics unavailable", e instanceof Error ? e.message : "Try again later.");
      } finally {
        set({ loading: false });
      }
    },

    setDateRange: (range) => set({ dateRange: range }),
    setSearchQuery: (q) => set({ searchQuery: q }),
    setProductFilter: (sku) => set({ productFilter: sku }),
    setEditingWidgets: (edit) => set({ isEditingWidgets: edit }),
    
    updateWidgetLayout: async (id, layout) => {
      set((state) => ({
        widgets: state.widgets.map((w) => w.id === id ? { ...w, ...layout } : w)
      }));
      await get().saveWidgetLayout(true);
    },
    
    saveWidgetLayout: async (silent = false) => {
      const { widgets, activeScopeKey } = get();
      if (!activeScopeKey) return;
      
      try {
        await analyticsRequest({ method: "PATCH", body: JSON.stringify({ action: "save_widgets", widgets }) });
        if (!silent) {
          useToastStore.getState().success("Layout synced", "Your SellerPlus dashboard layout is saved.");
        }
      } catch (e) {
        useToastStore.getState().error("Layout not saved", e instanceof Error ? e.message : "Try again later.");
      }
    },

    resetWidgetLayout: async () => {
      const { activeScopeKey } = get();
      if (!activeScopeKey) return;

      try {
        await analyticsRequest({ method: "PATCH", body: JSON.stringify({ action: "reset_widgets" }) });
        set({ widgets: DEFAULT_WIDGETS, isEditingWidgets: false });
        useToastStore.getState().info("Layout Reset", "Widget layouts reset to defaults.");
      } catch (e) {
        useToastStore.getState().error("Layout not reset", e instanceof Error ? e.message : "Try again later.");
      }
    },

    markAlertsAsRead: async () => {
      const { activeScopeKey } = get();
      if (!activeScopeKey) return;

      try {
        await analyticsRequest({ method: "PATCH", body: JSON.stringify({ action: "mark_alerts_read" }) });
        set((state) => ({ alerts: state.alerts.map(a => ({ ...a, isRead: true })), unreadAlertCount: 0 }));
      } catch (e) {
        useToastStore.getState().error("Notifications not updated", e instanceof Error ? e.message : "Try again later.");
      }
    },

    getSummary: () => {
      const { dateRange, financialLogs, productFilter } = get();
      if (financialLogs.length === 0 || productFilter !== "all") {
        return {
          revenue: null,
          netProfit: null,
          grossProfit: null,
          cogs: null,
          shippingCost: null,
          amazonFees: null,
          adSpend: null,
          adSales: null,
          refundCosts: null,
          margin: null,
          roi: null,
          ordersCount: null,
          unitsSold: null,
          refundCount: null
        };
      }
      const filteredLogs = filterFinancialLogs(financialLogs, getRangeWindows(dateRange).current);
      return summarizeFinancialLogs(filteredLogs);
    },

    getPrevSummary: () => {
      const { dateRange, financialLogs, productFilter } = get();
      if (financialLogs.length === 0 || productFilter !== "all") {
        return {
          revenue: null,
          netProfit: null,
          grossProfit: null,
          cogs: null,
          shippingCost: null,
          amazonFees: null,
          adSpend: null,
          adSales: null,
          refundCosts: null,
          margin: null,
          roi: null,
          ordersCount: null,
          unitsSold: null,
          refundCount: null
        };
      }
      const previousWindow = getRangeWindows(dateRange).previous;
      if (!previousWindow) return emptyFinancialSummary();
      const prevLogs = filterFinancialLogs(financialLogs, previousWindow);
      return summarizeFinancialLogs(prevLogs);
    },

    getProductAnalytics: () => {
      const { productLogs } = get();
      
      return productLogs.map((p) => {
        return {
          sku: p.sku,
          asin: p.asin,
          name: p.name,
          revenue: p.revenue ?? null,
          unitsSold: p.salesCount,
          cogs: p.cogs ?? null,
          fees: p.fees ?? null,
          netProfit: p.netProfit ?? null,
          margin: p.margin ?? null,
          roi: p.roi ?? null,
          refundRate: null,
          main_image: p.main_image ?? null,
          marketplace: p.marketplace ?? "Amazon.in"
        };
      });
    },

    getPpcSummary: () => {
      const { getSummary } = get();
      const sum = getSummary();
      const spend = sum.adSpend;
      const sales = sum.adSales;
      
      if (spend === null || sales === null) {
        return {
          adSpend: null,
          adSales: null,
          acos: null,
          tacos: null,
          roas: null,
          cpc: null,
          ctr: null,
          impressions: null,
          clicks: null,
          conversions: null
        };
      }

      const acos = sales > 0 ? (spend / sales) * 100 : null;
      const tacos = (sum.revenue !== null && sum.revenue > 0) ? (spend / sum.revenue) * 100 : null;
      const roas = spend > 0 ? sales / spend : null;

      return {
        adSpend: spend,
        adSales: sales,
        acos: acos === null ? null : Math.round(acos * 10) / 10,
        tacos: tacos === null ? null : Math.round(tacos * 10) / 10,
        roas: roas === null ? null : Math.round(roas * 100) / 100,
        cpc: null,
        ctr: null,
        impressions: null,
        clicks: null,
        conversions: null
      };
    },

    getInventoryPlanner: () => {
      return get().inventoryLogs;
    },

    getRefundSummary: () => {
      const { productLogs, getSummary } = get();
      const sum = getSummary();
      const refundVal = sum.refundCosts;
      const count = sum.refundCount;
      const refundRate = (sum.unitsSold !== null && sum.unitsSold > 0 && count !== null) ? (count / sum.unitsSold) * 100 : null;

      const topRefunded = productLogs.filter((p) => p.refundCount !== null).map((p) => {
        const count = p.refundCount as number;
        const rate = (p.salesCount !== null && p.salesCount > 0) ? (count / p.salesCount) * 100 : 0;
        return {
          sku: p.sku,
          name: p.name,
          count,
          rate: Math.round(rate * 10) / 10
        };
      }).sort((a, b) => b.count - a.count).filter(p => p.count > 0);

      return {
        refundCount: count,
        refundValue: refundVal,
        refundRate: refundRate !== null ? Math.round(refundRate * 10) / 10 : null,
        topRefunded
      };
    },

    getDailyPerformanceLogs: () => {
      const { financialLogs, dateRange } = get();
      const filteredLogs = filterFinancialLogs(financialLogs, getRangeWindows(dateRange).current);
      return filteredLogs.map((log) => {
        const summary = summarizeFinancialLogs([log]);
        return {
          date: log.date,
          revenue: log.revenue,
          netProfit: summary.netProfit,
          adSpend: log.adSpend,
          adSales: log.adSales,
          refundCosts: log.refundCosts,
          ordersCount: log.ordersCount,
        };
      }).reverse();
    },

    exportToCSV: (headers, rows, filename) => {
      const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(createCsv(headers, rows));
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
});

function emptyFinancialSummary(): FinancialSummary {
  return {
    revenue: null, netProfit: null, grossProfit: null, cogs: null,
    shippingCost: null, amazonFees: null, adSpend: null, adSales: null,
    refundCosts: null, margin: null, roi: null, ordersCount: null,
    unitsSold: null, refundCount: null,
  };
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function sumNullable(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value as number), 0);
}

export function summarizeFinancialLogs(logs: FinancialLogEntry[]): FinancialSummary {
  if (logs.length === 0) return emptyFinancialSummary();

  const revenue = logs.reduce((total, log) => total + log.revenue, 0);
  const ordersCount = logs.reduce((total, log) => total + log.ordersCount, 0);
  const unitsSold = logs.reduce((total, log) => total + log.unitsSold, 0);
  const cogs = sumNullable(logs.map((log) => log.cogs));
  const shippingCost = sumNullable(logs.map((log) => log.shippingCost));
  const amazonFees = sumNullable(logs.map((log) => log.amazonFees));
  const adSpend = sumNullable(logs.map((log) => log.adSpend));
  const adSales = sumNullable(logs.map((log) => log.adSales));
  const refundCosts = sumNullable(logs.map((log) => log.refundCosts));
  const refundCount = sumNullable(logs.map((log) => log.refundCount));
  const grossProfit = cogs !== null && shippingCost !== null && amazonFees !== null && refundCosts !== null
    ? revenue - cogs - shippingCost - amazonFees - refundCosts
    : null;
  const netProfit = grossProfit !== null && adSpend !== null ? grossProfit - adSpend : null;
  const margin = netProfit !== null && revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : null;
  const roi = netProfit !== null && cogs !== null && cogs > 0 ? Math.round((netProfit / cogs) * 1000) / 10 : null;

  return {
    revenue,
    netProfit,
    grossProfit,
    cogs,
    shippingCost,
    amazonFees,
    adSpend,
    adSales,
    refundCosts,
    margin,
    roi,
    ordersCount,
    unitsSold,
    refundCount,
  };
}

interface DateWindow { since: number; until: number }

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function getRangeWindows(preset: DateRangePreset, now = new Date()): { current: DateWindow; previous: DateWindow | null } {
  const today = startOfUtcDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const dayWindow = (days: number) => {
    const since = tomorrow.getTime() - days * 86_400_000;
    return { current: { since, until: tomorrow.getTime() }, previous: { since: since - days * 86_400_000, until: since } };
  };
  if (preset === "today") return dayWindow(1);
  if (preset === "yesterday") {
    return {
      current: { since: today.getTime() - 86_400_000, until: today.getTime() },
      previous: { since: today.getTime() - 2 * 86_400_000, until: today.getTime() - 86_400_000 },
    };
  }
  if (preset === "last_7d") return dayWindow(7);
  if (preset === "last_30d") return dayWindow(30);
  const thisMonth = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const previousMonth = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
  const monthBeforePrevious = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1);
  if (preset === "this_month") {
    return { current: { since: thisMonth, until: tomorrow.getTime() }, previous: { since: previousMonth, until: thisMonth } };
  }
  if (preset === "last_month") {
    return { current: { since: previousMonth, until: thisMonth }, previous: { since: monthBeforePrevious, until: previousMonth } };
  }
  return { current: { since: Number.NEGATIVE_INFINITY, until: Number.POSITIVE_INFINITY }, previous: null };
}

function filterFinancialLogs(logs: FinancialLogEntry[], window: DateWindow): FinancialLogEntry[] {
  return logs.filter((log) => {
    const timestamp = Date.parse(`${log.date}T00:00:00Z`);
    return Number.isFinite(timestamp) && timestamp >= window.since && timestamp < window.until;
  });
}
