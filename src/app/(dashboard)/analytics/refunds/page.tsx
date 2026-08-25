"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { GlassCard } from "@/components/glass-card";
import { useToastStore } from "@/hooks/use-toast-store";
import { useAuth } from "@/hooks/use-auth";
import { 
  RotateCcw, AlertTriangle, FileText, DollarSign, RefreshCw, Download
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { cn, formatCurrency } from "@/lib/utils";
import { createCsv } from "@/lib/csv";

interface RefundRecord {
  id: string;
  refund_id: string;
  order_id: string;
  sku: string | null;
  asin: string | null;
  quantity: number;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  processed_at: string;
  marketplace: string;
}

interface RefundOverview {
  dataWindow: { since: string; until: string };
  dataSource: string;
  sourceUpdatedAt: string | null;
  summary: { adjustments: number; units: number; amount: number };
  daily: Array<{ date: string; adjustments: number; units: number; amount: number }>;
  topSkus: Array<{ sku: string; adjustments: number; units: number; amount: number }>;
  total: number;
}

export default function RefundsConsolePage() {
  const user = useAuth((s) => s.user);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [overview, setOverview] = useState<RefundOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [days, setDays] = useState<30 | 90 | 365>(90);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const apiRequest = useCallback(async (path: string, init?: RequestInit) => {
    const response = await sellerplusApiFetch(path, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Refund request failed.");
    return body;
  }, []);

  const loadRefunds = useCallback(async () => {
    if (!user?.workspaceId) return;
    setLoading(true);
    try {
      const body = await apiRequest(`/api/refunds?days=${days}&page=${page}&limit=${pageSize}`);
      setOverview(body.data as RefundOverview);
      setRefunds((body.data?.rows ?? []) as RefundRecord[]);
    } catch (error) {
      useToastStore.getState().error("Refund data unavailable", error instanceof Error ? error.message : "Try again later.");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, days, page, user?.workspaceId]);

  useEffect(() => {
    void loadRefunds();
  }, [loadRefunds]);

  useEffect(() => {
    if (!syncJobId) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      let payload;
      try {
        payload = await apiRequest(`/api/jobs/${syncJobId}`);
      } catch (error) {
        if (!active) return;
        setIsSyncing(false);
        setSyncJobId(null);
        useToastStore.getState().error("Refund sync status unavailable", error instanceof Error ? error.message : "Try again later.");
        return;
      }
      if (!active) return;
      if (["failed", "canceled"].includes(payload.data?.status)) {
        setIsSyncing(false);
        setSyncJobId(null);
        useToastStore.getState().error("Refund sync stopped", payload.data?.last_error ?? payload.error ?? "The job did not complete.");
      } else if (payload.data?.status === "completed") {
        setIsSyncing(false);
        setSyncJobId(null);
        await loadRefunds();
        useToastStore.getState().success("Sync complete", "Amazon financial refund adjustments are up to date.");
      }
    }, 5_000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [apiRequest, loadRefunds, syncJobId]);

  const handleSyncRefunds = async () => {
    if (!user?.workspaceId) return;
    setIsSyncing(true);
    try {
      const data = await apiRequest("/api/amazon/sync-refunds", {
        method: "POST", body: JSON.stringify({ daysBack: days }),
      });
      if (data.data?.jobId) {
        setSyncJobId(data.data.jobId);
        useToastStore.getState().success("Refund sync queued", "SellerPlus will import Amazon financial events in the background.");
      }
    } catch (error: unknown) {
      useToastStore.getState().error("Sync Error", error instanceof Error ? error.message : "Error syncing refunds.");
      setIsSyncing(false);
    }
  };

  // Stats
  const summary = overview?.summary ?? { adjustments: 0, units: 0, amount: 0 };

  // Chart data formatting
  const chartData = useMemo(() => {
    return (overview?.daily ?? []).map((item) => ({ date: item.date, refundCosts: Number(item.amount) }));
  }, [overview?.daily]);

  const triggerExport = () => {
    if (refunds.length === 0) {
      useToastStore.getState().warning("No Data", "No refund logs found to export.");
      return;
    }
    const headers = ["Refund ID", "Order ID", "Date", "SKU", "ASIN", "Quantity", "Amount", "Reason"];
    const rows = refunds.map((r) => [
        r.refund_id,
        r.order_id,
        r.processed_at ? new Date(r.processed_at).toLocaleDateString() : "",
        r.sku,
        r.asin,
        r.quantity,
        r.amount,
        r.reason || "Unspecified source"
      ]);
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(createCsv(headers, rows));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sellerplus_refund_adjustments_page_${page}.csv`);
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
            Refund Financial Adjustments
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Amazon Finances API refund adjustments. This view does not infer customer return rates or reimbursement eligibility.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {([30, 90, 365] as const).map((value) => (
              <button key={value} type="button" onClick={() => { setDays(value); setPage(1); }} className={cn("h-8 rounded-md px-2.5 text-xs font-bold", days === value ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}>
                {value === 365 ? "1y" : `${value}d`}
              </button>
            ))}
          </div>
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
            <Download className="w-3.5 h-3.5" /> Export Page
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
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Referenced Units</span>
            <h3 className="text-2xl font-black text-white mt-0.5">{summary.units}</h3>
            <span className="text-[10px] text-zinc-500 font-medium">Across imported adjustments</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Refund Value</span>
            <h3 className="text-2xl font-black text-rose-400 mt-0.5">{formatCurrency(summary.amount)}</h3>
            <span className="text-[10px] text-zinc-500 font-medium">Debit adjustments</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Adjustment Records</span>
            <h3 className="text-2xl font-black text-white mt-0.5">{summary.adjustments}</h3>
            <span className="text-[10px] text-zinc-500 font-medium">Amazon-sourced rows</span>
          </div>
        </GlassCard>
      </div>

      {/* Refunds trends chart */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Refund Cost Trends</h3>
            <p className="text-xs text-zinc-600">Daily adjustment value in the selected window</p>
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
              <h3 className="text-sm font-bold text-white">Recent Financial Adjustment Records</h3>
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
                        No refund adjustment records found in this window.
                      </td>
                    </tr>
                  ) : (
                    refunds.map((l) => (
                      <tr key={l.id} className="h-12 hover:bg-white/[0.01]">
                        <td className="font-mono font-bold text-zinc-200">{l.order_id}</td>
                        <td>
                          <span className="font-bold text-white block max-w-[120px] truncate">{l.sku || "Not itemized"}</span>
                        </td>
                        <td className="font-bold text-rose-400 font-mono">-{formatCurrency(l.amount)}</td>
                        <td className="text-zinc-500">
                          {l.processed_at ? new Date(l.processed_at).toLocaleDateString() : ""}
                        </td>
                        <td className="text-[11px] text-zinc-400 max-w-[155px] truncate" title={l.reason ?? undefined}>
                          {l.reason ?? "Unspecified by source"}
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
              {(overview?.topSkus ?? []).length === 0 ? (
                <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                  No refund data available.
                </div>
              ) : (
                (overview?.topSkus ?? []).map((item) => (
                  <div key={item.sku} className="p-3 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">{item.sku}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-rose-400 block">{item.units} units</span>
                      <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">{formatCurrency(item.amount)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      </div>
      {(overview?.total ?? 0) > pageSize && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>Page {page} of {Math.ceil((overview?.total ?? 0) / pageSize)} · {overview?.total} adjustment rows</span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md border border-white/10 px-3 py-1.5 text-zinc-300 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page * pageSize >= (overview?.total ?? 0)} onClick={() => setPage((value) => value + 1)} className="rounded-md border border-white/10 px-3 py-1.5 text-zinc-300 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
