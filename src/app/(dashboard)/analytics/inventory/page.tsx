"use client";

import React, { useState, useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAnalyticsStore } from "@/hooks/use-analytics-store";
import { cn } from "@/lib/utils";
import {
  Package,
  Search,
  Truck,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
} from "lucide-react";

export default function InventoryPlannerPage() {
  const getInventoryPlanner = useAnalyticsStore((s) => s.getInventoryPlanner);
  const [searchQuery, setSearchQuery] = useState("");

  const inventoryItems = useMemo(() => getInventoryPlanner(), [getInventoryPlanner]);

  // Aggregate inventory indicators
  const stats = useMemo(() => {
    let outOfStock = 0;
    let lowStockRisk = 0;
    let healthyStock = 0;

    inventoryItems.forEach((item) => {
      if (item.currentStock === 0 || (item.daysUntilStockout !== null && item.daysUntilStockout <= 3)) {
        outOfStock++;
      } else if (item.daysUntilStockout !== null && item.daysUntilStockout <= 12) {
        lowStockRisk++;
      } else {
        healthyStock++;
      }
    });

    return { outOfStock, lowStockRisk, healthyStock };
  }, [inventoryItems]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return inventoryItems;
    const q = searchQuery.toLowerCase();
    return inventoryItems.filter(
      (item) => item.sku.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
    );
  }, [inventoryItems, searchQuery]);

  const getStatusBadge = (days: number | null, stock: number) => {
    if (stock === 0 || (days !== null && days <= 3)) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          Critical Stockout
        </span>
      );
    } else if (days !== null && days <= 12) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Reorder Risk
        </span>
      );
    } else if (days !== null) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Stock Healthy
        </span>
      );
    } else {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          N/A
        </span>
      );
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="border-b border-white/5 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Inventory Planner</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Stockout forecasting, average 30-day velocity multipliers, FBA inbound shipments, and automated restock planning.
          </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <GlassCard className="p-5 flex items-center gap-4 border border-rose-500/10 bg-rose-500/[0.01]">
          <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Critical Stockouts</span>
            <h3 className="text-2xl font-black text-rose-400 mt-0.5">{stats.outOfStock} SKUs</h3>
            <span className="text-[10px] text-zinc-400">Stockout within 3 days</span>
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex items-center gap-4 border border-amber-500/10 bg-amber-500/[0.01]">
          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Reorder Warnings</span>
            <h3 className="text-2xl font-black text-amber-400 mt-0.5">{stats.lowStockRisk} SKUs</h3>
            <span className="text-[10px] text-zinc-400">Restock order required soon</span>
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex items-center gap-4 border border-emerald-500/10 bg-emerald-500/[0.01]">
          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400 shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Healthy Stock</span>
            <h3 className="text-2xl font-black text-emerald-400 mt-0.5">{stats.healthyStock} SKUs</h3>
            <span className="text-[10px] text-zinc-400">Adequate inventory buffer</span>
          </div>
        </GlassCard>
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Filter by SKU or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-zinc-650"
          />
        </div>
      </div>

      {/* Inventory planning list */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <Package className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-bold text-white"> replenishment plan</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[750px]">
            <thead>
              <tr className="border-b border-white/5 text-zinc-500 font-semibold h-10 uppercase tracking-wider text-[10px]">
                <th>FBA Mapped Product</th>
                <th>Master SKU</th>
                <th className="text-right">FBA Stock On Hand</th>
                <th className="text-right">Inbound In-Transit</th>
                <th className="text-right">Velocity (daily)</th>
                <th className="text-right">Days to Stockout</th>
                <th className="text-right">Restock Suggestion</th>
                <th>Safety Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium text-zinc-300">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="h-20 text-center text-zinc-500">
                    No matching inventory records found.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const img = item.main_image || null;

                  return (
                    <tr key={item.sku} className="h-16 hover:bg-white/[0.02] transition-colors">
                      <td className="py-2">
                        <div className="flex items-center gap-3 max-w-xs">
                          {img ? (
                            <img src={img} alt={item.name} className="w-10 h-10 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-zinc-500 flex-shrink-0">
                              <Package className="w-5 h-5 text-zinc-650" />
                            </div>
                          )}
                          <span className="font-bold text-xs text-white truncate" title={item.name}>{item.name}</span>
                        </div>
                      </td>
                      <td className="font-mono text-zinc-400 font-bold">{item.sku}</td>
                      <td className="text-right">
                        <span className={cn(
                          "font-mono font-bold text-sm",
                          item.currentStock <= 10 ? "text-rose-400 animate-pulse" : "text-zinc-200"
                        )}>
                          {item.currentStock} units
                        </span>
                      </td>
                    <td className="text-right font-mono text-zinc-400">
                      {item.incomingStock > 0 ? (
                        <span className="text-indigo-400 font-bold">+{item.incomingStock} units</span>
                      ) : (
                        "0 units"
                      )}
                    </td>
                    <td className="text-right text-zinc-300 font-mono">
                      {item.velocity !== null ? `${item.velocity.toFixed(1)} units/day` : <span className="text-zinc-500">N/A</span>}
                    </td>
                    <td className="text-right font-mono font-bold">
                      {item.daysUntilStockout !== null ? (
                        <span className={cn(
                          item.daysUntilStockout <= 3 ? "text-rose-400 font-black" : item.daysUntilStockout <= 12 ? "text-amber-400" : "text-zinc-300"
                        )}>
                          {item.daysUntilStockout} days
                        </span>
                      ) : (
                        <span className="text-zinc-500">N/A</span>
                      )}
                    </td>
                    <td className="text-right">
                      {item.recommendation !== null && item.recommendation > 0 ? (
                        <span className="px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-extrabold text-[11px] font-mono">
                          Reorder {item.recommendation} units
                        </span>
                      ) : (
                        <span className="text-zinc-500 font-mono">{item.velocity === null ? "N/A" : "No action needed"}</span>
                      )}
                    </td>
                    <td>
                      {getStatusBadge(item.daysUntilStockout, item.currentStock)}
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
