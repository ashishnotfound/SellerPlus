"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";

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

interface AnalyticsStore {
  dateRange: DateRangePreset;
  searchQuery: string;
  productFilter: string;
  widgets: WidgetLayout[];
  isEditingWidgets: boolean;
  alerts: SystemAlert[];
  unreadAlertCount: number;
  activeUserId: string | null;
  loading: boolean;
  
  financialLogs: Array<{
    date: string;
    revenue: number;
    ordersCount: number;
    unitsSold: number;
    cogs: number;
    shippingCost: number;
    amazonFees: number;
    adSpend: number;
    adSales: number;
    refundCosts: number;
    refundCount: number;
  }>;
  
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
    netProfit: number;
    adSpend: number;
    adSales: number;
    refundCosts: number;
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

const checkSupabaseStatus = () => {
  if (typeof window === "undefined") return true;
  const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key";
  return isPlaceholder;
};

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => {


  return {
    dateRange: "last_30d",
    searchQuery: "",
    productFilter: "all",
    widgets: DEFAULT_WIDGETS,
    isEditingWidgets: false,
    alerts: [],
    unreadAlertCount: 0,
    activeUserId: null,
    loading: false,
    financialLogs: [],
    productLogs: [],
    ppcLogs: [],
    refundLogs: [],
    inventoryLogs: [],

    loadAnalyticsData: async (userId) => {
      if (get().financialLogs.length > 0 && get().activeUserId === userId) {
        return;
      }
      set({ activeUserId: userId, loading: true });
      const offline = checkSupabaseStatus();

      if (offline) {
        if (typeof window !== "undefined") {
          const storedW = localStorage.getItem("sp_analytics_widgets");
          if (storedW) set({ widgets: JSON.parse(storedW) });
        }
        set({ loading: false });
        return;
      }

      try {
        // --- 1. Fetch Widget Layouts ---
        const { data: layouts } = await supabase.from("widget_layouts").select("*").eq("user_id", userId);
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
          // Sync default layout to Supabase
          const dLayouts = DEFAULT_WIDGETS.map(w => ({
            user_id: userId,
            widget_id: w.id,
            col_span: w.w,
            row_span: w.h,
            x_pos: w.x,
            y_pos: w.y
          }));
          await supabase.from("widget_layouts").upsert(dLayouts, { onConflict: "user_id,widget_id" });
          set({ widgets: DEFAULT_WIDGETS });
        }

        // --- 2. Fetch Financial Logs ---
        const { data: finData } = await supabase.from("seller_financial_metrics").select("*").eq("user_id", userId).order("date", { ascending: false });
        if (finData && finData.length > 0) {
          const mappedFin = finData.map((f: any) => ({
            date: f.date,
            revenue: Number(f.revenue),
            ordersCount: f.orders_count,
            unitsSold: f.units_sold,
            cogs: Number(f.cogs),
            shippingCost: Number(f.shipping_cost),
            amazonFees: Number(f.amazon_fees),
            adSpend: Number(f.ad_spend),
            adSales: Number(f.ad_sales),
            refundCosts: Number(f.refund_costs),
            refundCount: f.refund_count
          }));
          set({ financialLogs: mappedFin });
        } else {
          set({ financialLogs: [] });
        }

        // --- 3. Fetch Alerts ---
        const { data: alertsDb } = await supabase.from("alert_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false });
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

        // --- 4. Fetch Listings for Inventory Planner & Product Analytics ---
        const { data: listDb } = await supabase
          .from("listings")
          .select(`
            *,
            cost_profiles(
              printing_cost,
              material_cost,
              packaging_cost,
              shipping_cost,
              labor_cost,
              misc_cost
            )
          `)
          .eq("user_id", userId)
          .eq("status", "active");

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
            const profile = l.cost_profiles;
            const unitCogs = profile
              ? (parseFloat(profile.printing_cost || 0) +
                 parseFloat(profile.material_cost || 0) +
                 parseFloat(profile.packaging_cost || 0) +
                 parseFloat(profile.shipping_cost || 0) +
                 parseFloat(profile.labor_cost || 0) +
                 parseFloat(profile.misc_cost || 0))
              : 0;

            const salesCount = l.units_sold_30d !== null ? Number(l.units_sold_30d) : 0;
            const revenue = l.revenue_30d !== null ? Number(l.revenue_30d) : 0;
            const totalCogs = unitCogs * salesCount;
            const commission = revenue * 0.15;
            const netProfit = revenue - totalCogs - commission;
            const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
            const roi = totalCogs > 0 ? (netProfit / totalCogs) * 100 : 0;

            return {
              sku: l.sku,
              asin: l.asin || "",
              name: l.title,
              salesCount: salesCount,
              refundCount: null,
              price: Number(l.price || 0),
              revenue: revenue,
              main_image: l.main_image,
              marketplace: l.marketplace || "Amazon.in",
              cogs: totalCogs,
              fees: commission,
              netProfit: netProfit,
              margin: Math.round(margin * 10) / 10,
              roi: Math.round(roi * 10) / 10
            };
          });
          set({ productLogs: mappedProductLogs });
        } else {
          set({ inventoryLogs: [], productLogs: [] });
        }
      } catch (e) {
        console.error("Failed to synchronize analytics metrics with Supabase", e);
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
      const { widgets, activeUserId } = get();
      const offline = checkSupabaseStatus();
      
      if (offline || !activeUserId) {
        if (typeof window !== "undefined") {
          localStorage.setItem("sp_analytics_widgets", JSON.stringify(widgets));
        }
        if (!silent) {
          useToastStore.getState().success("Layout Saved", "Custom widget layouts saved to seller preference cache.");
        }
        return;
      }
      
      try {
        // Upsert widget coordinates to Supabase
        for (const w of widgets) {
          await supabase.from("widget_layouts").upsert({
            user_id: activeUserId,
            widget_id: w.id,
            col_span: w.w,
            row_span: w.h,
            x_pos: w.x,
            y_pos: w.y
          }, { onConflict: "user_id,widget_id" });
        }
        if (!silent) {
          useToastStore.getState().success("Layout Synced", "Custom widget layouts synced successfully with Supabase.");
        }
      } catch (e) {
        console.error("Failed to sync layout parameters with Supabase", e);
      }
    },

    resetWidgetLayout: async () => {
      const { activeUserId } = get();
      const offline = checkSupabaseStatus();

      if (offline || !activeUserId) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("sp_analytics_widgets");
        }
        set({ widgets: DEFAULT_WIDGETS, isEditingWidgets: false });
        return;
      }

      try {
        await supabase.from("widget_layouts").delete().eq("user_id", activeUserId);
        set({ widgets: DEFAULT_WIDGETS, isEditingWidgets: false });
        useToastStore.getState().info("Layout Reset", "Widget layouts reset to defaults.");
      } catch (e) {
        console.error("Failed to reset layouts in Supabase", e);
      }
    },

    markAlertsAsRead: async () => {
      const { activeUserId } = get();
      const offline = checkSupabaseStatus();

      set((state) => {
        const readAlerts = state.alerts.map(a => ({ ...a, isRead: true }));
        return { alerts: readAlerts, unreadAlertCount: 0 };
      });

      if (offline || !activeUserId) {
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem("sp_analytics_alerts");
          if (stored) {
            const parsed = JSON.parse(stored) as SystemAlert[];
            localStorage.setItem("sp_analytics_alerts", JSON.stringify(parsed.map(a => ({ ...a, isRead: true }))));
          }
        }
        return;
      }

      try {
        await supabase.from("alert_logs").update({ is_read: true }).eq("user_id", activeUserId);
      } catch (e) {
        console.error("Failed to clear alerts in Supabase", e);
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
      const days = getPresetDays(dateRange);
      const filteredLogs = financialLogs.slice(0, days);

      let rev = 0, ord = 0, units = 0, cogsVal = 0, shipping = 0, fees = 0, spend = 0, adSalesVal = 0, refCosts = 0, refCount = 0;

      filteredLogs.forEach((l) => {
        rev += l.revenue;
        ord += l.ordersCount;
        units += l.unitsSold;
        cogsVal += l.cogs;
        shipping += l.shippingCost;
        fees += l.amazonFees;
        spend += l.adSpend;
        adSalesVal += l.adSales;
        refCosts += l.refundCosts;
        refCount += l.refundCount;
      });

      const gross = rev - cogsVal - shipping - fees - refCosts;
      const net = gross - spend;
      const margin = rev > 0 ? (net / rev) * 100 : 0;
      const roi = cogsVal > 0 ? (net / cogsVal) * 100 : 0;

      return {
        revenue: rev,
        netProfit: net,
        grossProfit: gross,
        cogs: cogsVal,
        shippingCost: shipping,
        amazonFees: fees,
        adSpend: spend,
        adSales: adSalesVal,
        refundCosts: refCosts,
        margin: Math.round(margin * 10) / 10,
        roi: Math.round(roi * 10) / 10,
        ordersCount: ord,
        unitsSold: units,
        refundCount: refCount
      };
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
      const days = getPresetDays(dateRange);
      const start = days;
      const end = days * 2;

      const prevLogs = financialLogs.slice(start, end);

      let rev = 0, ord = 0, units = 0, cogsVal = 0, shipping = 0, fees = 0, spend = 0, adSalesVal = 0, refCosts = 0, refCount = 0;

      prevLogs.forEach((l) => {
        rev += l.revenue;
        ord += l.ordersCount;
        units += l.unitsSold;
        cogsVal += l.cogs;
        shipping += l.shippingCost;
        fees += l.amazonFees;
        spend += l.adSpend;
        adSalesVal += l.adSales;
        refCosts += l.refundCosts;
        refCount += l.refundCount;
      });

      const gross = rev - cogsVal - shipping - fees - refCosts;
      const net = gross - spend;
      const margin = rev > 0 ? (net / rev) * 100 : 0;
      const roi = cogsVal > 0 ? (net / cogsVal) * 100 : 0;

      return {
        revenue: rev,
        netProfit: net,
        grossProfit: gross,
        cogs: cogsVal,
        shippingCost: shipping,
        amazonFees: fees,
        adSpend: spend,
        adSales: adSalesVal,
        refundCosts: refCosts,
        margin: Math.round(margin * 10) / 10,
        roi: Math.round(roi * 10) / 10,
        ordersCount: ord,
        unitsSold: units,
        refundCount: refCount
      };
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
          refundRate: 0,
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

      const acos = sales > 0 ? (spend / sales) * 100 : 0;
      const tacos = (sum.revenue !== null && sum.revenue > 0) ? (spend / sum.revenue) * 100 : 0;
      const roas = spend > 0 ? sales / spend : 0;

      return {
        adSpend: spend,
        adSales: sales,
        acos: Math.round(acos * 10) / 10,
        tacos: Math.round(tacos * 10) / 10,
        roas: Math.round(roas * 100) / 100,
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
      const count = sum.refundCount || null;
      const refundRate = (sum.unitsSold !== null && sum.unitsSold > 0 && count !== null) ? (count / sum.unitsSold) * 100 : null;

      const topRefunded = productLogs.map((p) => {
        const rate = (p.salesCount && p.refundCount) ? (p.refundCount / p.salesCount) * 100 : 0;
        return {
          sku: p.sku,
          name: p.name,
          count: p.refundCount || 0,
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
      const days = getPresetDays(dateRange);
      return financialLogs.slice(0, days).map(l => ({
        date: l.date,
        revenue: l.revenue,
        netProfit: l.revenue - l.cogs - l.shippingCost - l.amazonFees - l.adSpend - l.refundCosts,
        adSpend: l.adSpend,
        adSales: l.adSales,
        refundCosts: l.refundCosts,
        ordersCount: l.ordersCount
      })).reverse();
    },

    exportToCSV: (headers, rows, filename) => {
      let csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(",")].concat(rows.map(e => e.map(val => {
          if (typeof val === 'string' && val.includes(',')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(","))).join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
});

function getPresetDays(preset: DateRangePreset): number {
  switch (preset) {
    case "today": return 1;
    case "yesterday": return 2;
    case "last_7d": return 7;
    case "last_30d": return 30;
    case "this_month": return 28;
    case "last_month": return 30;
    default: return 90;
  }
}
