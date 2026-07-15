"use client";

import React, { useState, useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAnalyticsStore } from "@/hooks/use-analytics-store";
import { cn, formatCurrency } from "@/lib/utils";
import {
  FileText,
  Download,
  Calendar,
  Layers,
  Settings,
  Printer,
  CheckCircle,
} from "lucide-react";

type ReportType = "daily" | "weekly" | "monthly";

export default function ReportsCenterPage() {
  const financialLogs = useAnalyticsStore((s) => s.financialLogs);
  const exportToCSV = useAnalyticsStore((s) => s.exportToCSV);
  const getProductAnalytics = useAnalyticsStore((s) => s.getProductAnalytics);
  const isLoading = useAnalyticsStore((s) => s.loading);
  const [reportType, setReportType] = useState<ReportType>("monthly");
  const [activeTab, setActiveTab] = useState<"finance" | "products">("finance");
  
  // Aggregate report data based on type (daily, weekly, monthly)
  const reportRows = useMemo(() => {
    let raw = [...financialLogs];
    
    if (reportType === "daily") {
      return raw.slice(0, 15); // Show last 15 days
    } else if (reportType === "weekly") {
      // Group by weeks
      const weeks: any = {};
      raw.forEach((l) => {
        const date = new Date(l.date);
        const firstDay = new Date(date.setDate(date.getDate() - date.getDay()));
        const weekKey = firstDay.toISOString().split("T")[0];
        
        if (!weeks[weekKey]) {
          weeks[weekKey] = {
            date: `Week of ${weekKey}`,
            revenue: 0,
            cogs: 0,
            amazonFees: 0,
            adSpend: 0,
            refundCosts: 0,
            unitsSold: 0,
            ordersCount: 0
          };
        }
        weeks[weekKey].revenue += l.revenue || 0;
        weeks[weekKey].cogs += l.cogs || 0;
        weeks[weekKey].amazonFees += l.amazonFees || 0;
        weeks[weekKey].adSpend += l.adSpend || 0;
        weeks[weekKey].refundCosts += l.refundCosts || 0;
        weeks[weekKey].unitsSold += l.unitsSold || 0;
        weeks[weekKey].ordersCount += l.ordersCount || 0;
      });
      return Object.values(weeks).slice(0, 8); // Last 8 weeks
    } else {
      // Group by months
      const months: any = {};
      raw.forEach((l) => {
        const monthKey = l.date.substring(0, 7); // YYYY-MM
        if (!months[monthKey]) {
          months[monthKey] = {
            date: monthKey,
            revenue: 0,
            cogs: 0,
            amazonFees: 0,
            adSpend: 0,
            refundCosts: 0,
            unitsSold: 0,
            ordersCount: 0
          };
        }
        months[monthKey].revenue += l.revenue || 0;
        months[monthKey].cogs += l.cogs || 0;
        months[monthKey].amazonFees += l.amazonFees || 0;
        months[monthKey].adSpend += l.adSpend || 0;
        months[monthKey].refundCosts += l.refundCosts || 0;
        months[monthKey].unitsSold += l.unitsSold || 0;
        months[monthKey].ordersCount += l.ordersCount || 0;
      });
      return Object.values(months).slice(0, 3); // Last 3 months
    }
  }, [financialLogs, reportType]);

  const productData = useMemo(() => getProductAnalytics(), [getProductAnalytics]);

  const handleExport = (format: "csv" | "excel") => {
    if (activeTab === "finance") {
      const headers = ["Period / Date", "Gross Sales (₹)", "COGS (₹)", "Amazon Fees (₹)", "Ad Spend (₹)", "Refunds Cost (₹)", "Units Sold", "Orders Synced", "Net Profit (₹)"];
      const rows = reportRows.map((r: any) => {
        const profit = (r.revenue || 0) - (r.cogs || 0) - (r.amazonFees || 0) - (r.adSpend || 0) - (r.refundCosts || 0);
        return [
          r.date,
          r.revenue,
          r.cogs,
          r.amazonFees,
          r.adSpend,
          r.refundCosts,
          r.unitsSold,
          r.ordersCount,
          profit
        ];
      });
      exportToCSV(headers, rows, `sellerplus_${reportType}_financial_report`);
    } else {
      const headers = ["SKU / ASIN", "Product Title", "Gross Sales (₹)", "Units Sold", "COGS (₹)", "Fees (₹)", "Net Profit (₹)", "Margin (%)", "ROI (%)", "Refund Rate (%)"];
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
            Generate printable PDF reports, export historical financial statements, or catalog SKU audits.
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
            onClick={() => handleExport("excel")}
            className="h-9 px-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel/CSV
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
            FBA Ledger Verified
          </span>
        </div>

        {activeTab === "finance" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 font-semibold h-10 uppercase tracking-wider text-[9px]">
                  <th>Reporting Period</th>
                  <th className="text-right">Sales Revenue</th>
                  <th className="text-right">COGS (Costs)</th>
                  <th className="text-right">Amazon Fees</th>
                  <th className="text-right">Ad Spend</th>
                  <th className="text-right">Refund Costs</th>
                  <th className="text-right">Units sold</th>
                  <th className="text-right">Orders Count</th>
                  <th className="text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium text-zinc-300">
                {reportRows.map((r: any) => {
                  const profit = (r.revenue || 0) - (r.cogs || 0) - (r.amazonFees || 0) - (r.adSpend || 0) - (r.refundCosts || 0);
                  return (
                    <tr key={r.date} className="h-12 hover:bg-white/[0.01]">
                      <td className="font-bold text-white">{r.date}</td>
                      <td className="text-right text-white font-mono">{r.revenue !== null && r.revenue !== undefined ? `₹${r.revenue.toLocaleString("en-IN")}` : "N/A"}</td>
                      <td className="text-right text-rose-300 font-mono">{r.cogs !== null && r.cogs !== undefined ? `-₹${r.cogs.toLocaleString("en-IN")}` : "N/A"}</td>
                      <td className="text-right text-rose-300 font-mono">{r.amazonFees !== null && r.amazonFees !== undefined ? `-₹${r.amazonFees.toLocaleString("en-IN")}` : "N/A"}</td>
                      <td className="text-right text-rose-300 font-mono">{r.adSpend !== null && r.adSpend !== undefined ? `-₹${r.adSpend.toLocaleString("en-IN")}` : "N/A"}</td>
                      <td className="text-right text-rose-300 font-mono">{r.refundCosts !== null && r.refundCosts !== undefined ? `-₹${r.refundCosts.toLocaleString("en-IN")}` : "N/A"}</td>
                      <td className="text-right font-mono">{r.unitsSold !== null && r.unitsSold !== undefined ? r.unitsSold : "N/A"}</td>
                      <td className="text-right font-mono">{r.ordersCount !== null && r.ordersCount !== undefined ? r.ordersCount : "N/A"}</td>
                      <td className={cn(
                        "text-right font-bold font-mono",
                        profit >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {profit !== null ? `₹${profit.toLocaleString("en-IN")}` : "N/A"}
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
                  <th className="text-right">Net Profit</th>
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
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 uppercase">SellerPlus OS Consolidated P&L Report</h1>
            <p className="text-xs text-zinc-500 mt-1">Consolidated Accounting Statement • FBA Ledger Integrated</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-zinc-700">PRINT DATE: {new Date().toLocaleDateString("en-IN")}</span>
            <p className="text-[10px] text-zinc-500 mt-1">Status: System Verified</p>
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
                <th className="text-right">Amazon Fees</th>
                <th className="text-right">Ad Spend</th>
                <th className="text-right">Refund Costs</th>
                <th className="text-right">Units</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Net Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {reportRows.map((r: any) => {
                const profit = (r.revenue || 0) - (r.cogs || 0) - (r.amazonFees || 0) - (r.adSpend || 0) - (r.refundCosts || 0);
                return (
                  <tr key={r.date} className="h-8">
                    <td className="font-bold text-zinc-800">{r.date}</td>
                    <td className="text-right font-mono">₹{r.revenue?.toLocaleString("en-IN") || 0}</td>
                    <td className="text-right text-red-700 font-mono">-₹{r.cogs?.toLocaleString("en-IN") || 0}</td>
                    <td className="text-right text-red-700 font-mono">-₹{r.amazonFees?.toLocaleString("en-IN") || 0}</td>
                    <td className="text-right text-red-700 font-mono">-₹{r.adSpend?.toLocaleString("en-IN") || 0}</td>
                    <td className="text-right text-red-700 font-mono">-₹{r.refundCosts?.toLocaleString("en-IN") || 0}</td>
                    <td className="text-right font-mono">{r.unitsSold || 0}</td>
                    <td className="text-right font-mono">{r.ordersCount || 0}</td>
                    <td className={`text-right font-bold font-mono ${profit >= 0 ? "text-green-700" : "text-red-700"}`}>
                      ₹{profit.toLocaleString("en-IN")}
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
            <p className="text-[10px] text-zinc-500">SKU Level Operational Profit Margins & ROI Audits</p>
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
                <th className="text-right">Net Profit</th>
                <th className="text-right">Margin %</th>
                <th className="text-right">ROI %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {productData.map((p) => (
                <tr key={p.sku} className="h-8">
                  <td className="font-mono text-zinc-700 font-bold">{p.sku}</td>
                  <td className="max-w-[200px] truncate">{p.name}</td>
                  <td className="text-right font-mono">₹{p.revenue?.toLocaleString("en-IN") || 0}</td>
                  <td className="text-right font-mono">{p.unitsSold || 0}</td>
                  <td className="text-right text-red-700 font-mono">-₹{p.cogs?.toLocaleString("en-IN") || 0}</td>
                  <td className="text-right text-red-700 font-mono">-₹{p.fees?.toLocaleString("en-IN") || 0}</td>
                  <td className={`text-right font-bold font-mono ${(p.netProfit ?? 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    ₹{p.netProfit?.toLocaleString("en-IN") || 0}
                  </td>
                  <td className="text-right font-mono">{p.margin}%</td>
                  <td className="text-right font-mono">{p.roi}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-zinc-300 pt-4 flex justify-between items-center text-[8px] text-zinc-400">
          <span>SellerPlus Operating System • Automated Financial Report</span>
          <span>Page 2 of 2</span>
        </div>
      </div>
    </div>
  );
}
