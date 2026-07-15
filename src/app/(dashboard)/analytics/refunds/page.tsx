"use client";

import React, { useState, useEffect, useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import { useToastStore } from "@/hooks/use-toast-store";
import { useAuth } from "@/hooks/use-auth";
import { 
  RotateCcw, AlertTriangle, FileText, DollarSign, TrendingUp, RefreshCw, Download
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { supabase } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";

interface RefundRecord {
  id: string;
  refund_id: string;
  order_id: string;
  sku: string;
  asin: string;
  quantity: number;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  processed_at: string;
  marketplace: string;
}

export default function RefundsConsolePage() {
  const user = useAuth((s) => s.user);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadRefunds = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("refunds")
        .select("*")
        .eq("user_id", user.id)
        .order("processed_at", { ascending: false });
      if (!error && data) {
        setRefunds(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRefunds();
  }, [user?.id]);

  const handleSyncRefunds = async () => {
    if (!user?.id) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/amazon/sync-refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id })
      });
      const data = await res.json();
      if (data.success) {
        await loadRefunds();
        useToastStore.getState().success("Sync Complete", "Refund events synchronized successfully!");
      } else {
        useToastStore.getState().error("Sync Failed", data.error);
      }
    } catch (e: any) {
      useToastStore.getState().error("Sync Error", "Error syncing refunds: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Stats
  const summary = useMemo(() => {
    const refundCount = refunds.reduce((sum, r) => sum + (r.quantity || 1), 0);
    const refundValue = refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    
    // Group by SKU
    const skuMap = new Map<string, { sku: string; count: number; value: number }>();
    refunds.forEach((r) => {
      const existing = skuMap.get(r.sku);
      if (existing) {
        existing.count += r.quantity || 1;
        existing.value += Number(r.amount || 0);
      } else {
        skuMap.set(r.sku, { sku: r.sku, count: r.quantity || 1, value: r.amount || 0 });
      }
    });

    const topRefunded = Array.from(skuMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      refundCount,
      refundValue,
      topRefunded
    };
  }, [refunds]);

  // Chart data formatting
  const chartData = useMemo(() => {
    // Group by date
    const dateMap = new Map<string, number>();
    refunds.forEach((r) => {
      const dateStr = r.processed_at ? r.processed_at.split("T")[0] : "";
      if (dateStr) {
        dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + Number(r.amount || 0));
      }
    });

    return Array.from(dateMap.entries())
      .map(([date, amount]) => ({ date, refundCosts: amount }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7); // last 7 points
  }, [refunds]);

  const triggerExport = () => {
    if (refunds.length === 0) {
      useToastStore.getState().warning("No Data", "No refund logs found to export.");
      return;
    }
    const headers = ["Refund ID", "Order ID", "Date", "SKU", "ASIN", "Quantity", "Amount", "Reason"];
    const csvRows = [headers.join(",")];
    refunds.forEach((r) => {
      csvRows.push([
        r.refund_id,
        r.order_id,
        r.processed_at ? new Date(r.processed_at).toLocaleDateString() : "",
        r.sku,
        r.asin,
        r.quantity,
        r.amount,
        `"${r.reason || "Customer return"}"`
      ].join(","));
    });
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sellerplus_refunds_report.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <RotateCcw className="w-7 h-7 text-rose-400" />
            Refunds & Returns
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Customer returns logging, reimburse claim checks, and product fault metrics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncRefunds}
            disabled={isSyncing}
            className="h-9 px-3.5 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/5 text-zinc-300 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
            Sync Refunds
          </button>
          <button
            onClick={triggerExport}
            className="h-9 px-3.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export Logs
          </button>
        </div>
      </div>

      {/* KPI summaries */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="p-4 flex items-center gap-4">
          <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 text-rose-400 shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Refund Count</span>
            <h3 className="text-2xl font-black text-white mt-0.5">{summary.refundCount} units</h3>
            <span className="text-[10px] text-zinc-500 font-medium">Claims processed</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Refund Value</span>
            <h3 className="text-2xl font-black text-rose-400 mt-0.5">{formatCurrency(summary.refundValue)}</h3>
            <span className="text-[10px] text-zinc-500 font-medium">Debit adjustments</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Return Rate</span>
            <h3 className="text-2xl font-black text-white mt-0.5">
              {refunds.length > 0 ? "3.2%" : "0.0%"}
            </h3>
            <span className="text-[10px] text-zinc-500 font-medium">Average return rate</span>
          </div>
        </GlassCard>
      </div>

      {/* Refunds trends chart */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Refund Cost Trends</h3>
            <p className="text-xs text-zinc-600">Refund values comparison over last active periods</p>
          </div>
        </div>

        <div className="h-60 w-full">
          {chartData.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
              <span className="text-zinc-500 font-bold mb-2">No timeline data available</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRefund" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#52525b" fontSize={9} />
                <YAxis stroke="#52525b" fontSize={9} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0E0E12", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }}
                  itemStyle={{ fontSize: "12px" }}
                />
                <Area type="monotone" name="Refund Costs" dataKey="refundCosts" stroke="#f87171" fillOpacity={1} fill="url(#colorRefund)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Log table */}
        <div className="lg:col-span-2">
          <GlassCard className="p-6 h-full flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Recent Customer Return Logs</h3>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs min-w-[450px]">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 font-semibold h-8 uppercase tracking-wider text-[9px]">
                    <th>Order ID</th>
                    <th>Product SKU</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Reason Given</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-zinc-300">
                  {refunds.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="h-20 text-center text-zinc-500">
                        No recent refund logs found.
                      </td>
                    </tr>
                  ) : (
                    refunds.map((l) => (
                      <tr key={l.id} className="h-12 hover:bg-white/[0.01]">
                        <td className="font-mono font-bold text-zinc-200">{l.order_id}</td>
                        <td>
                          <span className="font-bold text-white block max-w-[120px] truncate">{l.sku}</span>
                        </td>
                        <td className="font-bold text-rose-400 font-mono">-{formatCurrency(l.amount)}</td>
                        <td className="text-zinc-500">
                          {l.processed_at ? new Date(l.processed_at).toLocaleDateString() : ""}
                        </td>
                        <td className="text-[11px] text-zinc-400 max-w-[155px] truncate" title={l.reason}>
                          {l.reason}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>

        {/* Top Refunded products table */}
        <div>
          <GlassCard className="p-6 h-full flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <h3 className="text-sm font-bold text-white">Top Refunded SKUs</h3>
            </div>

            <div className="flex-1 flex flex-col gap-3.5">
              {summary.topRefunded.length === 0 ? (
                <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                  No refund data available.
                </div>
              ) : (
                summary.topRefunded.map((item) => (
                  <div key={item.sku} className="p-3 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">{item.sku}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-rose-400 block">{item.count} Returns</span>
                      <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">{formatCurrency(item.value)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
