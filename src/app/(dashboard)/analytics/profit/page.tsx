"use client";

import React, { useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAnalyticsStore, DateRangePreset } from "@/hooks/use-analytics-store";
import { useConnections } from "@/hooks/use-connections";
import { useListingsStore } from "@/hooks/use-listings-store";
import { cn, formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Calendar,
  Lock,
  Unlock,
  Settings,
  HelpCircle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Package,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function ProfitDashboardPage() {
  const dateRange = useAnalyticsStore((s) => s.dateRange);
  const setDateRange = useAnalyticsStore((s) => s.setDateRange);
  const widgets = useAnalyticsStore((s) => s.widgets);
  const isEditingWidgets = useAnalyticsStore((s) => s.isEditingWidgets);
  const setEditingWidgets = useAnalyticsStore((s) => s.setEditingWidgets);
  const updateWidgetLayout = useAnalyticsStore((s) => s.updateWidgetLayout);
  const saveWidgetLayout = useAnalyticsStore((s) => s.saveWidgetLayout);
  const resetWidgetLayout = useAnalyticsStore((s) => s.resetWidgetLayout);
  const getSummary = useAnalyticsStore((s) => s.getSummary);
  const getPrevSummary = useAnalyticsStore((s) => s.getPrevSummary);
  const getDailyPerformanceLogs = useAnalyticsStore((s) => s.getDailyPerformanceLogs);
  const getPpcSummary = useAnalyticsStore((s) => s.getPpcSummary);
  const isLoading = useAnalyticsStore((s) => s.loading);

  const amazonConnected = useConnections((s) => s.amazonConnected);
  const listings = useListingsStore((s) => s.listings);

  const topProduct = useMemo(() => {
    if (listings.length === 0) return null;
    return [...listings].sort((a, b) => (b.revenue_30d || 0) - (a.revenue_30d || 0))[0];
  }, [listings]);

  const lowestStockProduct = useMemo(() => {
    if (listings.length === 0) return null;
    return [...listings].sort((a, b) => (a.available_qty || 0) - (b.available_qty || 0))[0];
  }, [listings]);

  const summary = useMemo(() => getSummary(), [dateRange, getSummary]);
  const prevSummary = useMemo(() => getPrevSummary(), [dateRange, getPrevSummary]);
  const ppcSummary = useMemo(() => getPpcSummary(), [dateRange, getPpcSummary]);
  const chartData = useMemo(() => getDailyPerformanceLogs(), [dateRange, getDailyPerformanceLogs]);

  // Calculate percentage changes
  const calculateChange = (current: number | null, previous: number | null): number | null => {
    if (current === null || previous === null) return null;
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const revenueChange = calculateChange(summary.revenue, prevSummary.revenue);
  const profitChange = calculateChange(summary.netProfit, prevSummary.netProfit);
  const ordersChange = calculateChange(summary.ordersCount, prevSummary.ordersCount);
  const unitsChange = calculateChange(summary.unitsSold, prevSummary.unitsSold);
  const marginChange = (summary.margin !== null && prevSummary.margin !== null) ? summary.margin - prevSummary.margin : null;

  const renderTrend = (value: number | null, isPercentage = true) => {
    if (value === null) return <span className="text-[10px] text-zinc-600">N/A</span>;
    const isPositive = value >= 0;
    const formattedVal = Math.abs(value).toFixed(1);
    
    return (
      <span className={cn(
        "text-[10px] font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border shrink-0",
        isPositive 
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
          : "bg-rose-500/10 text-rose-400 border-rose-500/20"
      )}>
        {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {formattedVal}{isPercentage ? "%" : ""}
      </span>
    );
  };

  // Draggable-resizable widgets rendering selector
  const sortedWidgets = useMemo(() => {
    return [...widgets].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
  }, [widgets]);

  const renderWidgetContent = (id: string) => {
    switch (id) {
      case "today_profit":
        return (
          <div className="flex flex-col h-full justify-between">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Net Profit</span>
            <span className="text-2xl font-black text-emerald-400">{summary.netProfit !== null ? `₹${summary.netProfit.toLocaleString("en-IN")}` : "Not Available"}</span>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-2">
              <span>vs Prev Period</span>
              {renderTrend(profitChange)}
            </div>
          </div>
        );
      case "revenue":
        return (
          <div className="flex flex-col h-full justify-between">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Gross Sales</span>
            <span className="text-2xl font-black text-white">{summary.revenue !== null ? `₹${summary.revenue.toLocaleString("en-IN")}` : "Not Available"}</span>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-2">
              <span>vs Prev Period</span>
              {renderTrend(revenueChange)}
            </div>
          </div>
        );
      case "orders":
        return (
          <div className="flex flex-col h-full justify-between">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Orders Synced</span>
            <span className="text-2xl font-black text-indigo-400">{summary.ordersCount !== null ? summary.ordersCount : "Not Available"}</span>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-2">
              <span>vs Prev Period</span>
              {renderTrend(ordersChange)}
            </div>
          </div>
        );
      case "units_sold":
        return (
          <div className="flex flex-col h-full justify-between">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Units Mapped</span>
            <span className="text-2xl font-black text-amber-400">{summary.unitsSold !== null ? summary.unitsSold : "Not Available"}</span>
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-2">
              <span>vs Prev Period</span>
              {renderTrend(unitsChange)}
            </div>
          </div>
        );
      case "top_product":
        return (
          <div className="flex flex-col h-full justify-between">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Top Performing SKU</span>
            {topProduct ? (
              <>
                <div className="mt-1.5 flex items-center gap-2.5">
                  {topProduct.main_image ? (
                    <img src={topProduct.main_image} alt={topProduct.title} className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-zinc-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-black text-white block truncate">{topProduct.sku}</span>
                    <span className="text-[10px] text-zinc-450 block truncate leading-tight mt-0.5">{topProduct.title}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-[10px] text-zinc-400 mt-2.5">
                  <span>Sales Volume</span>
                  <span className="text-emerald-400 font-bold">{topProduct.sales_30d !== null && topProduct.sales_30d !== undefined ? `${topProduct.sales_30d} units` : "Not Available"}</span>
                </div>
              </>
            ) : (
              <span className="text-xs text-zinc-500 mt-2">No listings tracked</span>
            )}
          </div>
        );
      case "lowest_stock":
        return (
          <div className="flex flex-col h-full justify-between">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider font-mono">Lowest Stock SKU</span>
            {lowestStockProduct ? (
              <>
                <div className="mt-1">
                  <span className="text-sm font-black text-rose-400 block truncate">{lowestStockProduct.sku}</span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Stock level: {lowestStockProduct.available_qty} units</span>
                </div>
                {lowestStockProduct.available_qty <= 10 && (
                  <div className="text-[9px] text-rose-500 font-black uppercase mt-1 tracking-wider bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded block text-center animate-pulse">
                    Restock suggested
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-zinc-500 mt-2">No stock warnings</span>
            )}
          </div>
        );
      case "ad_spend":
        return (
          <div className="flex flex-col h-full justify-between">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">PPC Ad Spend</span>
            <span className="text-2xl font-black text-rose-400">{summary.adSpend !== null ? `₹${summary.adSpend.toLocaleString("en-IN")}` : "Not Available"}</span>
            <div className="flex justify-between items-center text-[10px] text-zinc-400 mt-2">
              <span>ACOS / TACOS</span>
              <span className="font-mono text-zinc-200">{ppcSummary.acos !== null ? `${ppcSummary.acos}%` : "N/A"} / {ppcSummary.tacos !== null ? `${ppcSummary.tacos}%` : "N/A"}</span>
            </div>
          </div>
        );
      case "profit_margin":
        return (
          <div className="flex flex-col h-full justify-between">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Profit Margin & ROI</span>
              {renderTrend(marginChange, false)}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <span className="text-[10px] text-zinc-500 block">Margin %</span>
                <span className="text-xl font-black text-emerald-400">{summary.margin !== null ? `${summary.margin}%` : "N/A"}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block">ROI %</span>
                <span className="text-xl font-black text-indigo-400">{summary.roi !== null ? `${summary.roi}%` : "N/A"}</span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Loading skeleton — shown while analytics store fetches from Supabase
  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 animate-pulse">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div className="h-9 w-48 rounded-xl bg-white/5" />
          <div className="h-8 w-64 rounded-xl bg-white/5" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-white/5" />
        <div className="h-64 rounded-2xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Date preset selector header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Profit Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Real-time Profit & Loss breakdown from Amazon SP-API and multi-channel catalogs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 border border-white/5 overflow-x-auto max-w-[90vw] sm:max-w-none">
            {([
              { key: "today", label: "Today" },
              { key: "yesterday", label: "Yesterday" },
              { key: "last_7d", label: "7 Days" },
              { key: "last_30d", label: "30 Days" },
              { key: "this_month", label: "This Month" },
              { key: "last_month", label: "Last Month" },
              { key: "lifetime", label: "Lifetime" },
            ] as const).map((range) => (
              <button
                key={range.key}
                onClick={() => setDateRange(range.key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-all whitespace-nowrap",
                  dateRange === range.key
                    ? "bg-indigo-500 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {isEditingWidgets ? (
              <>
                <button
                  onClick={resetWidgetLayout}
                  className="h-9 px-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-bold transition-all"
                >
                  Reset
                </button>
                <button
                  onClick={() => setEditingWidgets(false)}
                  className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" /> Done Editing
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditingWidgets(true)}
                className="h-9 px-3 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Unlock className="w-3.5 h-3.5 text-zinc-500" /> Edit Layout
              </button>
            )}
          </div>
        </div>
      </div>

      {/* DRAGGABLE & RESIZABLE WIDGET BOARD */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-[160px] relative">
        {sortedWidgets.map((w) => {
          const gridClass = cn(
            w.w === 1 && "md:col-span-1",
            w.w === 2 && "md:col-span-2",
            w.w === 3 && "md:col-span-3",
            w.w === 4 && "md:col-span-4",
            w.h === 1 && "row-span-1",
            w.h === 2 && "row-span-2",
            w.h === 3 && "row-span-3"
          );

          return (
            <GlassCard
              key={w.id}
              className={cn(
                "p-5 relative transition-all duration-300 flex flex-col justify-between overflow-hidden",
                gridClass,
                isEditingWidgets && "ring-2 ring-indigo-500/50 border-indigo-500/30 scale-[0.98]"
              )}
            >
              {/* Widget Controls in Edit Mode */}
              {isEditingWidgets && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/80 backdrop-blur border border-white/10 rounded-md p-1 z-10">
                  {/* Row navigation */}
                  <button 
                    onClick={() => updateWidgetLayout(w.id, { y: Math.max(0, w.y - 1) })} 
                    className="w-5 h-5 flex items-center justify-center text-[10px] text-zinc-400 hover:text-white font-black"
                    title="Move Up"
                  >
                    ▲
                  </button>
                  <button 
                    onClick={() => updateWidgetLayout(w.id, { y: w.y + 1 })} 
                    className="w-5 h-5 flex items-center justify-center text-[10px] text-zinc-400 hover:text-white font-black"
                    title="Move Down"
                  >
                    ▼
                  </button>
                  {/* Width modification */}
                  <button 
                    onClick={() => updateWidgetLayout(w.id, { w: Math.max(1, w.w - 1) })} 
                    className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-zinc-500 hover:text-white"
                    title="Shrink Width"
                  >
                    W-
                  </button>
                  <button 
                    onClick={() => updateWidgetLayout(w.id, { w: Math.min(4, w.w + 1) })} 
                    className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-zinc-500 hover:text-white"
                    title="Expand Width"
                  >
                    W+
                  </button>
                </div>
              )}
              {renderWidgetContent(w.id)}
            </GlassCard>
          );
        })}
      </div>

      {/* CHARTS CONTAINER: Sales vs Profits */}
      <GlassCard className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-bold text-white">Daily Performance Timeline</h3>
            <p className="text-xs text-zinc-500">Revenue compared against net operating profit</p>
          </div>
          <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
            Recharts Analytics Engine
          </span>
        </div>

        <div className="h-72 w-full">
          {chartData.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
              <span className="text-zinc-500 font-bold mb-2">No timeline data available</span>
              <span className="text-xs text-zinc-600">Connect a real Amazon seller account to sync daily financial logs</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0E0E12", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }}
                  labelStyle={{ fontSize: "11px", color: "#a1a1aa", fontWeight: "bold" }}
                  itemStyle={{ fontSize: "12px" }}
                />
                <Area type="monotone" name="Revenue" dataKey="revenue" stroke="#818cf8" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                <Area type="monotone" name="Net Profit" dataKey="netProfit" stroke="#34d399" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlassCard>

      {/* DETAILED CALCULATIONS TABLE */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-bold text-white">Consolidated Profit & Loss Statement</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[600px]">
            <thead>
              <tr className="border-b border-white/5 text-zinc-500 font-semibold h-9 uppercase tracking-wider text-[10px]">
                <th>Profit & Loss Metric</th>
                <th className="text-right">Current Period</th>
                <th className="text-right">Previous Period</th>
                <th className="text-right">Change (%) / margin gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium text-zinc-300">
              <tr className="h-11">
                <td className="font-bold text-white">Gross Revenue (Sales)</td>
                <td className="text-right text-white">{summary.revenue !== null ? `₹${summary.revenue.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right text-zinc-500">{prevSummary.revenue !== null ? `₹${prevSummary.revenue.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right">{renderTrend(revenueChange)}</td>
              </tr>
              <tr className="h-11">
                <td>Product Costs (COGS)</td>
                <td className="text-right text-rose-300">{summary.cogs !== null ? `-₹${summary.cogs.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right text-zinc-600">{prevSummary.cogs !== null ? `-₹${prevSummary.cogs.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right">{renderTrend(calculateChange(summary.cogs, prevSummary.cogs))}</td>
              </tr>
              <tr className="h-11">
                <td>Amazon Referral & FBA Fees</td>
                <td className="text-right text-rose-300">{summary.amazonFees !== null ? `-₹${summary.amazonFees.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right text-zinc-600">{prevSummary.amazonFees !== null ? `-₹${prevSummary.amazonFees.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right">{renderTrend(calculateChange(summary.amazonFees, prevSummary.amazonFees))}</td>
              </tr>
              <tr className="h-11">
                <td>Shipping & Logistic Costs</td>
                <td className="text-right text-rose-300">{summary.shippingCost !== null ? `-₹${summary.shippingCost.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right text-zinc-600">{prevSummary.shippingCost !== null ? `-₹${prevSummary.shippingCost.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right">{renderTrend(calculateChange(summary.shippingCost, prevSummary.shippingCost))}</td>
              </tr>
              <tr className="h-11">
                <td>Refund & Return Reimbursement Costs</td>
                <td className="text-right text-rose-300">{summary.refundCosts !== null ? `-₹${summary.refundCosts.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right text-zinc-600">{prevSummary.refundCosts !== null ? `-₹${prevSummary.refundCosts.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right">{renderTrend(calculateChange(summary.refundCosts, prevSummary.refundCosts))}</td>
              </tr>
              <tr className="h-11 bg-white/[0.01]">
                <td className="font-bold text-white">Gross Operating Profit</td>
                <td className="text-right text-white font-bold">{summary.grossProfit !== null ? `₹${summary.grossProfit.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right text-zinc-500">{prevSummary.grossProfit !== null ? `₹${prevSummary.grossProfit.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right">{renderTrend(calculateChange(summary.grossProfit, prevSummary.grossProfit))}</td>
              </tr>
              <tr className="h-11">
                <td>PPC / Sponsored Ads Advertising Spend</td>
                <td className="text-right text-rose-300">{summary.adSpend !== null ? `-₹${summary.adSpend.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right text-zinc-600">{prevSummary.adSpend !== null ? `-₹${prevSummary.adSpend.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right">{renderTrend(calculateChange(summary.adSpend, prevSummary.adSpend))}</td>
              </tr>
              <tr className="h-11 bg-indigo-500/5 font-bold">
                <td className="text-indigo-300">Net Operating Profit</td>
                <td className="text-right text-emerald-400 text-sm">{summary.netProfit !== null ? `₹${summary.netProfit.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right text-zinc-500">{prevSummary.netProfit !== null ? `₹${prevSummary.netProfit.toLocaleString("en-IN")}` : "N/A"}</td>
                <td className="text-right">{renderTrend(profitChange)}</td>
              </tr>
              <tr className="h-11">
                <td>Gross Profit Margin (%)</td>
                <td className="text-right text-zinc-200">{summary.margin !== null ? `${summary.margin}%` : "N/A"}</td>
                <td className="text-right text-zinc-600">{prevSummary.margin !== null ? `${prevSummary.margin}%` : "N/A"}</td>
                <td className="text-right">
                  {marginChange !== null ? (
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      marginChange >= 0 
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    )}>
                      {marginChange >= 0 ? "+" : ""}{marginChange.toFixed(1)}% gap
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-600">N/A</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
