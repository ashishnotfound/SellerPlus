"use client";

import React, { useState, useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import {
  summarizeFinancialLogs,
  useAnalyticsStore,
  type FinancialLogEntry,
} from "@/hooks/use-analytics-store";
import { cn } from "@/lib/utils";
import {
  FileText,
  Download,
  Printer,
} from "lucide-react";

type ReportType = "daily" | "weekly" | "monthly";

interface ReportRow {
  date: string;
  revenue: number;
  cogs: number | null;
  shippingCost: number | null;
  amazonFees: number | null;
  adSpend: number | null;
  refundCosts: number | null;
  unitsSold: number;
  ordersCount: number;
  contributionProfit: number | null;
}

function reportRow(date: string, logs: FinancialLogEntry[]): ReportRow {
  const summary = summarizeFinancialLogs(logs);
  return {
    date,
    revenue: summary.revenue ?? 0,
    cogs: summary.cogs,
    shippingCost: summary.shippingCost,
    amazonFees: summary.amazonFees,
    adSpend: summary.adSpend,
    refundCosts: summary.refundCosts,
    unitsSold: summary.unitsSold ?? 0,
    ordersCount: summary.ordersCount ?? 0,
    contributionProfit: summary.netProfit,
  };
}

function currency(value: number | null, negative = false): string {
  if (value === null) return "N/A";
  return `${negative ? "-" : ""}₹${value.toLocaleString("en-IN")}`;
}

export default function ReportsCenterPage() {
  const financialLogs = useAnalyticsStore((s) => s.financialLogs);
  const exportToCSV = useAnalyticsStore((s) => s.exportToCSV);
  const getProductAnalytics = useAnalyticsStore((s) => s.getProductAnalytics);
  const isLoading = useAnalyticsStore((s) => s.loading);
  const [reportType, setReportType] = useState<ReportType>("monthly");
  const [activeTab, setActiveTab] = useState<"finance" | "products">("finance");
  
  const reportRows = useMemo<ReportRow[]>(() => {
    const raw = [...financialLogs].sort((a, b) => b.date.localeCompare(a.date));
    if (reportType === "daily") {
      return raw.slice(0, 15).map((log) => reportRow(log.date, [log]));
    }

    const buckets = new Map<string, FinancialLogEntry[]>();
    for (const log of raw) {
      let key = log.date.slice(0, 7);
      if (reportType === "weekly") {
        const date = new Date(`${log.date}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() - date.getUTCDay());
        key = date.toISOString().slice(0, 10);
      }
      buckets.set(key, [...(buckets.get(key) ?? []), log]);
    }
    const limit = reportType === "weekly" ? 8 : 3;
    return [...buckets.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, limit)
      .map(([key, logs]) => reportRow(reportType === "weekly" ? `Week of ${key}` : key, logs));
  }, [financialLogs, reportType]);

  const productData = useMemo(() => getProductAnalytics(), [getProductAnalytics]);

  const handleExport = () => {
    if (activeTab === "finance") {
      const headers = ["Period / Date", "Gross Sales (₹)", "COGS (₹)", "Shipping (₹)", "Amazon Fees (₹)", "Ad Spend (₹)", "Refund Costs (₹)", "Units Sold", "Orders Synced", "Contribution Profit (₹)"];
      const rows = reportRows.map((row) => [
        row.date,
        row.revenue,
        row.cogs,
        row.shippingCost,
        row.amazonFees,
        row.adSpend,
        row.refundCosts,
        row.unitsSold,
        row.ordersCount,
        row.contributionProfit,
      ]);
      exportToCSV(headers, rows, `sellerplus_${reportType}_financial_report`);
    } else {
      const headers = ["SKU / ASIN", "Product Title", "Gross Sales (₹)", "Units Sold", "COGS (₹)", "Fees (₹)", "Contribution Profit (₹)", "Margin (%)", "ROI (%)", "Refund Rate (%)"];
      const rows = productData.map((p) => [
        p.sku,
        p.name,
        p.revenue,
        p.unitsSold,
        p.cogs,
        p.fees,
        p.netProfit,
        p.margin,
        p.roi,
        p.refundRate
      ]);
      exportToCSV(headers, rows, `sellerplus_products_performance_report`);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  // Loading skeleton — shown while analytics store fetches from Supabase
  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 animate-pulse">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div className="h-9 w-44 rounded-xl bg-white/5" />
          <div className="flex gap-2">
            <div className="h-8 w-20 rounded-lg bg-white/5" />
            <div className="h-8 w-20 rounded-lg bg-white/5" />
          </div>
        </div>
        <div className="h-16 rounded-2xl bg-white/5" />
        <div className="h-72 rounded-2xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 print:p-0 print:bg-white print:text-black">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-white/5 pb-4 print:hidden">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Reports Center</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Print and export source-qualified operating facts. Missing inputs remain explicitly unavailable.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-white/5 p-1 border border-white/5">
          {([
            { key: "daily", label: "Daily" },
            { key: "weekly", label: "Weekly" },
            { key: "monthly", label: "Monthly" },
          ] as const).map((range) => (
            <button
              key={range.key}
              onClick={() => setReportType(range.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-all whitespace-nowrap",
                reportType === range.key
                  ? "bg-indigo-500 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2 print:hidden">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("finance")}
            className={cn(
              "text-xs font-bold uppercase tracking-wider pb-2 border-b-2 transition-all",
              activeTab === "finance" 
                ? "text-white border-indigo-400" 
                : "text-zinc-500 hover:text-zinc-300 border-transparent"
            )}
          >
            Financial Statements
          </button>
          <button
            onClick={() => setActiveTab("products")}
            className={cn(
              "text-xs font-bold uppercase tracking-wider pb-2 border-b-2 transition-all",
              activeTab === "products" 
                ? "text-white border-indigo-400" 
                : "text-zinc-500 hover:text-zinc-300 border-transparent"
            )}
          >
            SKU Unit Performance
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintPdf}
            className="h-9 px-3 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> PDF / Print
          </button>
          <button
            onClick={handleExport}
            className="h-9 px-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Interactive Screen View */}
      <GlassCard className="p-6 print:hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white capitalize">
              {reportType} Consolidated Report
            </h3>
          </div>
          <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
            Source-qualified facts
          </span>
        </div>

        {activeTab === "finance" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[820px]">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 font-semibold h-10 uppercase tracking-wider text-[9px]">
                  <th>Reporting Period</th>
                  <th className="text-right">Sales Revenue</th>
                  <th className="text-right">COGS (Costs)</th>
                  <th className="text-right">Shipping</th>
                  <th className="text-right">Amazon Fees</th>
                  <th className="text-right">Ad Spend</th>
                  <th className="text-right">Refund Costs</th>
                  <th className="text-right">Units sold</th>
                  <th className="text-right">Orders Count</th>
                  <th className="text-right">Contribution Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium text-zinc-300">
                {reportRows.map((row) => {
                  const profit = row.contributionProfit;
                  return (
                    <tr key={row.date} className="h-12 hover:bg-white/[0.01]">
                      <td className="font-bold text-white">{row.date}</td>
                      <td className="text-right text-white font-mono">{currency(row.revenue)}</td>
                      <td className="text-right text-rose-300 font-mono">{currency(row.cogs, true)}</td>
                      <td className="text-right text-rose-300 font-mono">{currency(row.shippingCost, true)}</td>
                      <td className="text-right text-rose-300 font-mono">{currency(row.amazonFees, true)}</td>
                      <td className="text-right text-rose-300 font-mono">{currency(row.adSpend, true)}</td>
                      <td className="text-right text-rose-300 font-mono">{currency(row.refundCosts, true)}</td>
                      <td className="text-right font-mono">{row.unitsSold}</td>
                      <td className="text-right font-mono">{row.ordersCount}</td>
                      <td className={cn(
                        "text-right font-bold font-mono",
                        profit === null ? "text-zinc-500" : profit >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {currency(profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 font-semibold h-10 uppercase tracking-wider text-[9px]">
                  <th>SKU Code</th>
                  <th>Product Title</th>
                  <th className="text-right">Sales Revenue</th>
                  <th className="text-right">Units sold</th>
                  <th className="text-right">COGS (Costs)</th>
                  <th className="text-right">Fees (Referral/FBA)</th>
                  <th className="text-right">Contribution Profit</th>
                  <th className="text-right">Margin %</th>
                  <th className="text-right">ROI %</th>
                  <th className="text-right">Refund rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium text-zinc-300">
                {productData.map((p) => (
                  <tr key={p.sku} className="h-12 hover:bg-white/[0.01]">
                    <td className="font-mono font-bold text-zinc-400">{p.sku}</td>
                    <td className="max-w-[150px] truncate">{p.name}</td>
                    <td className="text-right text-white font-mono">
                      {p.revenue !== null && p.revenue !== undefined ? `₹${p.revenue.toLocaleString("en-IN")}` : "Not Available"}
                    </td>
                    <td className="text-right font-mono">
                      {p.unitsSold !== null && p.unitsSold !== undefined ? p.unitsSold : "Not Available"}
                    </td>
                    <td className="text-right text-rose-300 font-mono">
                      {p.cogs !== null && p.cogs !== undefined ? `-₹${p.cogs.toLocaleString("en-IN")}` : "Not Available"}
                    </td>
                    <td className="text-right text-rose-300 font-mono">
                      {p.fees !== null && p.fees !== undefined ? `-₹${p.fees.toLocaleString("en-IN")}` : "Not Available"}
                    </td>
                    <td className={cn(
                      "text-right font-bold font-mono",
                      p.netProfit !== null && p.netProfit !== undefined
                        ? (p.netProfit >= 0 ? "text-emerald-400" : "text-rose-400")
                        : "text-zinc-500"
                    )}>
                      {p.netProfit !== null && p.netProfit !== undefined ? `₹${p.netProfit.toLocaleString("en-IN")}` : "Not Available"}
                    </td>
                    <td className="text-right font-mono">
                      {p.margin !== null && p.margin !== undefined ? `${p.margin}%` : "Not Available"}
                    </td>
                    <td className="text-right font-mono">
                      {p.roi !== null && p.roi !== undefined ? `${p.roi}%` : "Not Available"}
                    </td>
                    <td className="text-right font-mono">
                      {p.refundRate !== null && p.refundRate !== undefined ? `${p.refundRate}%` : "Not Available"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Branded PDF Printable Document (Rendered only on print media) */}
      <div className="hidden print:flex flex-col gap-6 w-full text-black bg-white p-4">
        {/* Brand Header */}
        <div className="flex justify-between items-start border-b-2 border-zinc-900 pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 uppercase">SellerPlus Operating Facts Report</h1>
            <p className="text-xs text-zinc-500 mt-1">Made by ReyoStudio • Missing financial inputs are shown as N/A</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-zinc-700">PRINT DATE: {new Date().toLocaleDateString("en-IN")}</span>
            <p className="text-[10px] text-zinc-500 mt-1">Status: Source-qualified</p>
          </div>
        </div>

        {/* Section 1: Financial Statements */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider border-b border-zinc-300 pb-1">1. Period Financial Performance ({reportType.toUpperCase()})</h2>
          <table className="w-full text-left text-[10px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-400 text-zinc-650 font-bold h-7 uppercase text-[8px]">
                <th>Period</th>
                <th className="text-right">Sales Revenue</th>
                <th className="text-right">COGS (Costs)</th>
                <th className="text-right">Shipping</th>
                <th className="text-right">Amazon Fees</th>
                <th className="text-right">Ad Spend</th>
                <th className="text-right">Refund Costs</th>
                <th className="text-right">Units</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Contribution Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {reportRows.map((row) => {
                const profit = row.contributionProfit;
                return (
                  <tr key={row.date} className="h-8">
                    <td className="font-bold text-zinc-800">{row.date}</td>
                    <td className="text-right font-mono">{currency(row.revenue)}</td>
                    <td className="text-right text-red-700 font-mono">{currency(row.cogs, true)}</td>
                    <td className="text-right text-red-700 font-mono">{currency(row.shippingCost, true)}</td>
                    <td className="text-right text-red-700 font-mono">{currency(row.amazonFees, true)}</td>
                    <td className="text-right text-red-700 font-mono">{currency(row.adSpend, true)}</td>
                    <td className="text-right text-red-700 font-mono">{currency(row.refundCosts, true)}</td>
                    <td className="text-right font-mono">{row.unitsSold}</td>
                    <td className="text-right font-mono">{row.ordersCount}</td>
                    <td className={`text-right font-bold font-mono ${profit === null ? "text-zinc-500" : profit >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {currency(profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* CSS Page Break marker */}
        <div style={{ pageBreakBefore: "always" }} />

        {/* Section 2: Product Catalog SKU Performance */}
        <div className="flex flex-col gap-2 pt-6">
          <div className="border-b border-zinc-900 pb-2 mb-2">
            <h1 className="text-xl font-bold text-zinc-900">SellerPlus OS Performance Ledger</h1>
            <p className="text-[10px] text-zinc-500">SKU-level source coverage and operating facts</p>
          </div>
          
          <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider border-b border-zinc-300 pb-1">2. Product Catalog Unit Diagnostics</h2>
          <table className="w-full text-left text-[9px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-400 text-zinc-650 font-bold h-7 uppercase text-[8px]">
                <th>SKU Code</th>
                <th>Product Title</th>
                <th className="text-right">Sales Revenue</th>
                <th className="text-right">Units</th>
                <th className="text-right">COGS</th>
                <th className="text-right">Amazon Fees</th>
                <th className="text-right">Contribution Profit</th>
                <th className="text-right">Margin %</th>
                <th className="text-right">ROI %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {productData.map((p) => (
                <tr key={p.sku} className="h-8">
                  <td className="font-mono text-zinc-700 font-bold">{p.sku}</td>
                  <td className="max-w-[200px] truncate">{p.name}</td>
                  <td className="text-right font-mono">{currency(p.revenue)}</td>
                  <td className="text-right font-mono">{p.unitsSold ?? "N/A"}</td>
                  <td className="text-right text-red-700 font-mono">{currency(p.cogs, true)}</td>
                  <td className="text-right text-red-700 font-mono">{currency(p.fees, true)}</td>
                  <td className={`text-right font-bold font-mono ${p.netProfit === null ? "text-zinc-500" : p.netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {currency(p.netProfit)}
                  </td>
                  <td className="text-right font-mono">{p.margin === null ? "N/A" : `${p.margin}%`}</td>
                  <td className="text-right font-mono">{p.roi === null ? "N/A" : `${p.roi}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-zinc-300 pt-4 flex justify-between items-center text-[8px] text-zinc-400">
          <span>SellerPlus by ReyoStudio • Source-qualified operating report</span>
          <span>Page 2 of 2</span>
        </div>
      </div>
    </div>
  );
}
