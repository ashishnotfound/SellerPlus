"use client";

import React, { useState, useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAnalyticsStore } from "@/hooks/use-analytics-store";
import { cn, formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  Search,
  ArrowUpDown,
  Tag,
  Percent,
  RefreshCw,
  Eye,
  AlertCircle,
  Package,
} from "lucide-react";

type SortOption = "highest_profit" | "lowest_profit" | "highest_sales" | "worst_performers";

export default function ProductPerformancePage() {
  const getProductAnalytics = useAnalyticsStore((s) => s.getProductAnalytics);
  const dateRange = useAnalyticsStore((s) => s.dateRange);
  const setDateRange = useAnalyticsStore((s) => s.setDateRange);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("highest_profit");

  const productData = useMemo(() => getProductAnalytics(), [dateRange, getProductAnalytics]);

  // Apply search query and sort rules
  const processedProducts = useMemo(() => {
    let list = [...productData];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    }

    // Sort by selection
    list.sort((a, b) => {
      const aProfit = a.netProfit ?? 0;
      const bProfit = b.netProfit ?? 0;
      const aSales = a.unitsSold ?? 0;
      const bSales = b.unitsSold ?? 0;
      const aRefund = a.refundRate ?? 0;
      const bRefund = b.refundRate ?? 0;

      switch (sortBy) {
        case "lowest_profit":
          return aProfit - bProfit;
        case "highest_sales":
          return bSales - aSales;
        case "worst_performers":
          return bRefund - aRefund;
        case "highest_profit":
        default:
          return bProfit - aProfit;
      }
    });

    return list;
  }, [productData, searchQuery, sortBy]);

  return (
    <div className="flex flex-col gap-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Product Performance</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Detailed SKU-level analysis of sales revenue, unit economics, margin weights, and returns.
          </p>
        </div>

        {/* Date presets */}
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
      </div>

      {/* Control bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search SKU or product title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-zinc-650"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <span className="text-xs text-zinc-500 font-semibold shrink-0">Sort By</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="h-11 px-4 rounded-xl border border-white/10 bg-[#0E0E12] text-xs text-white focus:outline-none focus:border-indigo-500 transition-all"
          >
            <option value="highest_profit">Highest Profit Margin</option>
            <option value="lowest_profit">Lowest Profit Margin</option>
            <option value="highest_sales">Highest Sales Velocity</option>
            <option value="worst_performers">Worst Performers (Refunds)</option>
          </select>
        </div>
      </div>

      {/* Table grid */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">SKU Performance Matrix ({processedProducts.length})</h3>
          <span className="text-[10px] uppercase font-bold text-zinc-500 bg-white/5 px-2.5 py-1 rounded border border-white/5">
            Active Inventory Mapping
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[800px]">
            <thead>
              <tr className="border-b border-white/5 text-zinc-500 font-semibold h-10 uppercase tracking-wider text-[10px]">
                <th>SKU details</th>
                <th>ASIN link</th>
                <th className="text-right">Sales Revenue</th>
                <th className="text-right">Units sold</th>
                <th className="text-right">COGS (Costs)</th>
                <th className="text-right">Amazon Fees</th>
                <th className="text-right">Net Profit</th>
                <th className="text-right">Margin %</th>
                <th className="text-right">ROI %</th>
                <th className="text-right">Refund rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium text-zinc-300">
              {processedProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="h-24 text-center text-zinc-500">
                    No products found matching the search criteria.
                  </td>
                </tr>
              ) : (
                processedProducts.map((p) => {
                  const img = p.main_image || null;
                  const marketplace = p.marketplace || "Amazon.in";

                  return (
                    <tr key={p.sku} className="h-16 hover:bg-white/[0.01] transition-colors">
                      <td className="py-2.5">
                        <div className="flex items-center gap-3 max-w-sm">
                          {img ? (
                            <img src={img} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-zinc-500 flex-shrink-0">
                              <Package className="w-5 h-5 text-zinc-650" />
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-xs text-white truncate" title={p.name}>{p.name}</span>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono leading-none">
                              <span className="text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5">{p.sku}</span>
                              <span className="text-zinc-500">{marketplace}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-[10px] text-indigo-400 font-bold hover:underline">
                        <a href={`https://www.amazon.in/dp/${p.asin}`} target="_blank" rel="noopener noreferrer">
                          {p.asin}
                        </a>
                      </td>
                    <td className="text-right font-bold text-white">
                      {p.revenue !== null && p.revenue !== undefined ? `₹${p.revenue.toLocaleString("en-IN")}` : "Not Available"}
                    </td>
                    <td className="text-right text-zinc-200">
                      {p.unitsSold !== null && p.unitsSold !== undefined ? `${p.unitsSold} units` : "Not Available"}
                    </td>
                    <td className="text-right text-rose-300/80">
                      {p.cogs !== null && p.cogs !== undefined ? `-₹${p.cogs.toLocaleString("en-IN")}` : "Not Available"}
                    </td>
                    <td className="text-right text-rose-300/80">
                      {p.fees !== null && p.fees !== undefined ? `-₹${p.fees.toLocaleString("en-IN")}` : "Not Available"}
                    </td>
                    <td className="text-right text-emerald-400 font-bold">
                      {p.netProfit !== null && p.netProfit !== undefined ? `₹${p.netProfit.toLocaleString("en-IN")}` : "Not Available"}
                    </td>
                    <td className={cn(
                      "text-right font-bold",
                      p.margin !== null && p.margin !== undefined
                        ? (p.margin >= 20 ? "text-emerald-400" : p.margin >= 10 ? "text-indigo-400" : "text-amber-400")
                        : "text-zinc-500"
                    )}>
                      {p.margin !== null && p.margin !== undefined ? `${p.margin}%` : "Not Available"}
                    </td>
                    <td className="text-right font-mono text-zinc-400">
                      {p.roi !== null && p.roi !== undefined ? `${p.roi}%` : "Not Available"}
                    </td>
                    <td className="text-right">
                      {p.refundRate !== null && p.refundRate !== undefined ? (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                          p.refundRate > 5 
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        )}>
                          {p.refundRate}% Rate
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-[10px]">Not Available</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
