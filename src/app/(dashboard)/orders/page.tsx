"use client";

import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrdersAnalytics, OrderRecord, OrderItemWithProduct } from "@/hooks/use-orders-analytics";
import { GlassCard } from "@/components/glass-card";
import { 
  Search, Filter, Calendar, ShoppingBag, MapPin, CreditCard, Clock, 
  ChevronRight, RefreshCw, Download, FileText, Printer, FileJson, X, 
  HelpCircle, Eye, CheckCircle, Package, AlertTriangle, ArrowUpDown
} from "lucide-react";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { cn, formatCurrency } from "@/lib/utils";
import { useToastStore } from "@/hooks/use-toast-store";
import { createCsv } from "@/lib/csv";
import { createXlsx } from "@/lib/xlsx";

function marketplaceId(value: string): string | undefined {
  if (value === "IN") return "A21TJRUUN4KGV";
  if (value === "US") return "ATVPDKIKX0DER";
  if (value === "UK") return "A1F83G8C2ARO7P";
  return undefined;
}

function marketplaceLabel(value: string | null): string {
  if (value === "A21TJRUUN4KGV") return "IN";
  if (value === "ATVPDKIKX0DER") return "US";
  if (value === "A1F83G8C2ARO7P") return "UK";
  return value ?? "—";
}

function deliveryProgress(status: string): number {
  const normalized = status.toLowerCase();
  if (normalized === "delivered") return 100;
  if (normalized.includes("shipped")) return 75;
  if (normalized === "packed") return 50;
  if (normalized.includes("cancel")) return 0;
  return 25;
}

export default function RedesignedOrdersPage() {
  const user = useAuth((s) => s.user);

  // States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("last_30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Drawer details drawer state
  const [drawerOrder, setDrawerOrder] = useState<OrderRecord | null>(null);
  const [drawerItems, setDrawerItems] = useState<OrderItemWithProduct[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [customNote, setCustomNote] = useState("");

  // Sort
  const [sortField, setSortField] = useState<"purchase_date" | "total_amount">("purchase_date");
  const [sortAsc, setSortAsc] = useState(false);

  const dateRange = useMemo(() => {
    const end = datePreset === "custom" && customEndDate
      ? new Date(`${customEndDate}T23:59:59.999`).toISOString()
      : new Date().toISOString();
    const endTime = new Date(end).getTime();
    if (datePreset === "custom" && customStartDate) return { start: new Date(`${customStartDate}T00:00:00.000`).toISOString(), end };
    const days = datePreset === "today" ? 1 : datePreset === "last_7d" ? 7 : datePreset === "last_365d" ? 365 : 30;
    return { start: new Date(endTime - days * 86_400_000).toISOString(), end };
  }, [datePreset, customStartDate, customEndDate]);

  const { analytics, loading, error, lastSyncedAt, total, refetch } = useOrdersAnalytics(user?.id, {
    page: currentPage,
    pageSize,
    search: searchTerm,
    status: statusFilter === "all" ? undefined : statusFilter,
    marketplace: marketplaceId(marketplaceFilter),
    start: dateRange.start,
    end: dateRange.end,
    sort: sortField,
    ascending: sortAsc,
  });
  const filteredOrders = analytics.recentOrders;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Bulk actions handlers
  const handleToggleSelectAll = () => {
    if (selectedOrderIds.length === filteredOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedOrderIds((prev) => 
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await sellerplusApiFetch("/api/amazon/sync-orders", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Amazon order sync could not be queued.");
      useToastStore.getState().success("Order sync queued", `Job ${payload.data.jobId} will run in the durable worker queue.`);
      await refetch();
    } catch (caught) {
      useToastStore.getState().error("Sync not queued", caught instanceof Error ? caught.message : "Try again later.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Drawer opener
  const handleOpenDrawer = async (order: OrderRecord) => {
    setDrawerOrder(order);
    setDrawerLoading(true);
    setCustomNote(order.notes ?? "");
    try {
      const items = analytics.recentOrderItems.filter((i) => i.order_id === order.id);
      setDrawerItems(items);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!drawerOrder) return;
    try {
      const response = await sellerplusApiFetch(`/api/orders/${drawerOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: customNote, expectedVersion: drawerOrder.version }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Notes could not be saved.");
      setDrawerOrder((current) => current ? { ...current, notes: payload.data.notes, version: Number(payload.data.version) } : current);
      useToastStore.getState().success("Notes Saved");
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().error("Save Failed", msg);
    }
  };

  // Exports helper
  const triggerExport = (format: "csv" | "excel" | "json" | "pdf") => {
    const list = selectedOrderIds.length > 0 
      ? filteredOrders.filter(o => selectedOrderIds.includes(o.id))
      : filteredOrders;

    if (list.length === 0) {
      useToastStore.getState().warning("Nothing to Export", "No order records selected or found.");
      return;
    }

    if (format === "json") {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(list, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `sellerplus_orders_report.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } else if (format === "csv" || format === "excel") {
      const headers = ["Order ID", "Purchase Date", "Status", "Total Amount", "Currency", "Fulfillment", "Marketplace", "Items Shipped"];
      const rows = list.map((o) => [
          o.channel_order_id,
          o.purchase_date ? new Date(o.purchase_date).toLocaleDateString() : "",
          o.status,
          o.total_amount,
          o.currency,
          o.fulfillment_channel || "Merchant",
          o.marketplace_id || "US",
          o.number_of_items_shipped
        ]);
      const downloadAnchor = document.createElement("a");
      let objectUrl: string | null = null;
      if (format === "excel") {
        const workbook = createXlsx(headers, rows, "SellerPlus Orders");
        const buffer = new ArrayBuffer(workbook.byteLength);
        new Uint8Array(buffer).set(workbook);
        objectUrl = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        downloadAnchor.href = objectUrl;
        downloadAnchor.download = "sellerplus_orders_report.xlsx";
      } else {
        downloadAnchor.href = "data:text/csv;charset=utf-8," + encodeURIComponent(createCsv(headers, rows));
        downloadAnchor.download = "sellerplus_orders_report.csv";
      }
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } else if (format === "pdf") {
      window.print();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-white/5 pb-4 print:hidden">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-[#00c48c]" />
            Manage Orders
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Tenant-scoped Amazon order data with incremental SP-API synchronization and durable background jobs.
          </p>
          <p className="text-zinc-600 text-[10px] mt-1">Last successful sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Not yet synchronized"}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/5 text-zinc-300 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            Queue Amazon Sync
          </button>
          <button
            onClick={() => triggerExport("pdf")}
            className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/5 text-zinc-300 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print Layout
          </button>
          <div className="relative group">
            <button
              className="h-9 px-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export Selected ({selectedOrderIds.length})
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-40 bg-[#121216] border border-white/10 rounded-lg shadow-xl hidden group-hover:block z-30 overflow-hidden">
              <button onClick={() => triggerExport("csv")} className="w-full px-3 py-2 text-left text-zinc-300 hover:bg-white/5 hover:text-white text-xs flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> CSV</button>
              <button onClick={() => triggerExport("excel")} className="w-full px-3 py-2 text-left text-zinc-300 hover:bg-white/5 hover:text-white text-xs flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Excel (.xlsx)</button>
              <button onClick={() => triggerExport("json")} className="w-full px-3 py-2 text-left text-zinc-300 hover:bg-white/5 hover:text-white text-xs flex items-center gap-2"><FileJson className="w-3.5 h-3.5" /> JSON format</button>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Filters row */}
      <GlassCard className="p-4 flex flex-col md:flex-row flex-wrap gap-4 items-center justify-between print:hidden">
        {/* Keyword Search */}
        <div className="w-full md:w-80 h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search Order ID, SKU, ASIN, Title..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
          />
        </div>

        {/* Filters preset selectors */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase font-bold">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="h-8 rounded-lg border border-white/10 bg-[#161719] text-xs text-zinc-300 px-2.5 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="shipped">Shipped</option>
              <option value="unshipped">Unshipped</option>
              <option value="pending">Pending</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>

          {/* Marketplace */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase font-bold">Marketplace</span>
            <select
              value={marketplaceFilter}
              onChange={(e) => { setMarketplaceFilter(e.target.value); setCurrentPage(1); }}
              className="h-8 rounded-lg border border-white/10 bg-[#161719] text-xs text-zinc-300 px-2.5 focus:outline-none"
            >
              <option value="all">All Markets</option>
              <option value="IN">amazon.in (India)</option>
              <option value="US">amazon.com (US)</option>
              <option value="UK">amazon.co.uk (UK)</option>
            </select>
          </div>

          {/* Date preset */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase font-bold">Date</span>
            <select
              value={datePreset}
              onChange={(e) => { setDatePreset(e.target.value); setCurrentPage(1); }}
              className="h-8 rounded-lg border border-white/10 bg-[#161719] text-xs text-zinc-300 px-2.5 focus:outline-none"
            >
              <option value="last_365d">Last 365 Days</option>
              <option value="today">Today</option>
              <option value="last_7d">Last 7 Days</option>
              <option value="last_30d">Last 30 Days</option>
              <option value="custom">Custom Date</option>
            </select>
          </div>
        </div>

        {/* Custom date range fields */}
        {datePreset === "custom" && (
          <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 border-t border-white/5 pt-3 md:pt-0">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => { setCustomStartDate(e.target.value); setCurrentPage(1); }}
              className="h-8 rounded-lg border border-white/10 bg-[#161719] text-xs text-zinc-300 px-2"
            />
            <span className="text-zinc-500 text-xs">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => { setCustomEndDate(e.target.value); setCurrentPage(1); }}
              className="h-8 rounded-lg border border-white/10 bg-[#161719] text-xs text-zinc-300 px-2"
            />
          </div>
        )}
      </GlassCard>

      {/* Main Table layout */}
      <GlassCard className="overflow-hidden">
        {error ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            <span className="text-sm text-zinc-300">{error}</span>
          </div>
        ) : loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-t-2 border-[#00c48c] border-solid rounded-full animate-spin" />
            <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Loading tenant order index...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[1000px]">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 font-semibold h-10 uppercase tracking-wider text-[9px] select-none">
                  <th className="pl-4 w-10">
                    <button 
                      onClick={handleToggleSelectAll}
                      className="w-4 h-4 rounded border border-white/15 bg-white/[0.02] flex items-center justify-center text-white"
                    >
                      {selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0 && "✓"}
                    </button>
                  </th>
                  <th onClick={() => { setSortField("purchase_date"); setSortAsc(!sortAsc); setCurrentPage(1); }} className="cursor-pointer hover:text-white transition-colors">
                    Order ID / Purchase Date <ArrowUpDown className="w-2.5 h-2.5 inline ml-1" />
                  </th>
                  <th>Market</th>
                  <th>Product Details</th>
                  <th>Sku / Asin</th>
                  <th>Fulfillment</th>
                  <th>Qty</th>
                  <th onClick={() => { setSortField("total_amount"); setSortAsc(!sortAsc); setCurrentPage(1); }} className="text-right cursor-pointer hover:text-white transition-colors">
                    Total Amount <ArrowUpDown className="w-2.5 h-2.5 inline ml-1" />
                  </th>
                  <th>Status</th>
                  <th className="pr-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="h-32 text-center text-zinc-500">No synced orders match selected search triggers.</td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => {
                    const isSelected = selectedOrderIds.includes(o.id);
                    // Find all items associated with this order
                    const items = analytics.recentOrderItems.filter((i) => i.order_id === o.id);
                    const firstItem = items[0];

                    return (
                      <tr key={o.id} className={cn("h-16 hover:bg-white/[0.01] transition-colors", isSelected && "bg-white/[0.02]")}>
                        <td className="pl-4">
                          <button
                            onClick={() => handleToggleSelectRow(o.id)}
                            className="w-4 h-4 rounded border border-white/15 bg-white/[0.02] flex items-center justify-center text-white"
                          >
                            {isSelected && "✓"}
                          </button>
                        </td>
                        <td>
                          <div className="flex flex-col">
                            <span className="font-bold text-white font-mono text-[11px]">{o.channel_order_id}</span>
                            <span className="text-[10px] text-zinc-500 mt-0.5">
                              {o.purchase_date ? new Date(o.purchase_date).toLocaleString() : "Sync pending"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase bg-zinc-500/10 text-zinc-400 border-zinc-500/20">
                            {marketplaceLabel(o.marketplace_id)}
                          </span>
                        </td>
                        <td className="max-w-[240px]">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-zinc-600">
                              {firstItem?.listing?.main_image ? (
                                <img src={firstItem.listing.main_image} alt="" className="w-full h-full object-cover rounded" />
                              ) : (
                                <Package className="w-4 h-4" />
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-zinc-300 font-semibold truncate text-3xs">
                                {firstItem?.title || "FBA Order Line Item"}
                              </span>
                              {items.length > 1 && (
                                <span className="text-[9px] text-[#00c48c] mt-0.5">+{items.length - 1} more items</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col font-mono text-[10px]">
                            <span className="text-zinc-400 font-bold">{firstItem?.seller_sku || "—"}</span>
                            <span className="text-zinc-600 text-[9px] mt-0.5">{firstItem?.asin || "—"}</span>
                          </div>
                        </td>
                        <td>
                          <span className="text-[10px] font-bold uppercase text-zinc-400">
                            {o.fulfillment_channel || "FBA"}
                          </span>
                        </td>
                        <td className="text-zinc-300 font-mono">
                          {items.reduce((sum, i) => sum + Math.max(0, i.quantity_ordered), 0)}
                        </td>
                        <td className="text-right text-white font-mono font-bold">
                          {formatCurrency(o.total_amount)}
                        </td>
                        <td>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                            o.status.toLowerCase().includes("shipped") || o.status.toLowerCase().includes("delivered")
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : o.status.toLowerCase().includes("pending")
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          )}>
                            {o.status}
                          </span>
                        </td>
                        <td className="pr-4 text-right">
                          <button
                            onClick={() => handleOpenDrawer(o)}
                            className="h-7 w-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-all ml-auto"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 print:hidden">
              <span className="text-[10px] text-zinc-500">{total.toLocaleString("en-IN")} matching orders · Page {currentPage} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => { setCurrentPage((page) => Math.max(1, page - 1)); setSelectedOrderIds([]); }}
                  className="h-8 px-3 rounded-lg border border-white/10 text-xs text-zinc-300 disabled:opacity-40"
                >Previous</button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => { setCurrentPage((page) => Math.min(totalPages, page + 1)); setSelectedOrderIds([]); }}
                  className="h-8 px-3 rounded-lg border border-white/10 text-xs text-zinc-300 disabled:opacity-40"
                >Next</button>
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Side Details Drawer */}
      {drawerOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end transition-opacity duration-300 print:hidden">
          <div className="w-[500px] max-w-full bg-[#0b0c0e] border-l border-white/10 h-full flex flex-col shadow-2xl relative">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Order Information</span>
                <span className="text-sm font-bold text-white font-mono mt-0.5">{drawerOrder.channel_order_id}</span>
              </div>
              <button 
                onClick={() => setDrawerOrder(null)}
                className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body Scroll */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 text-xs text-zinc-400">
              {drawerLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="w-5 h-5 border-t-2 border-[#00c48c] border-solid rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Status Timeline */}
                  <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] flex flex-col gap-2.5">
                    <span className="font-bold text-white uppercase text-[10px]">Delivery Tracker</span>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
                      <span>Marketplace: {marketplaceLabel(drawerOrder.marketplace_id)}</span>
                      <span className="text-[#00c48c]">{drawerOrder.status}</span>
                    </div>
                    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div className="bg-[#00c48c] h-full rounded-full" style={{ width: `${deliveryProgress(drawerOrder.status)}%` }} />
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="flex flex-col gap-2">
                    <span className="font-bold text-white uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500" /> Shipping & Customer Details
                    </span>
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                      <div>
                        <span className="text-zinc-500 text-[10px]">Buyer Name</span>
                        <p className="text-white font-medium mt-0.5">{drawerOrder.buyer_name || "N/A"}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px]">Delivery State</span>
                        <p className="text-white font-medium mt-0.5">{drawerOrder.shipping_address_state || "N/A"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Items Purchased List */}
                  <div className="flex flex-col gap-2">
                    <span className="font-bold text-white uppercase text-[10px] tracking-wide">Items Summary</span>
                    <div className="flex flex-col gap-2">
                      {drawerItems.map((item) => (
                        <div key={item.id} className="p-3 rounded-xl border border-white/5 bg-white/[0.01] flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            {item.listing?.main_image ? (
                              <img src={item.listing.main_image} alt="" className="w-full h-full object-cover rounded" />
                            ) : (
                              <Package className="w-5 h-5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-white truncate block">{item.title || "Order Item Details"}</span>
                            <span className="text-[10px] text-zinc-500 block font-mono mt-0.5">SKU: {item.seller_sku} | ASIN: {item.asin}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-white font-mono font-bold block">{formatCurrency(item.item_price)}</span>
                            <span className="text-[9px] text-zinc-500">Qty: {item.quantity_ordered}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Charges Breakdown */}
                  <div className="flex flex-col gap-2">
                    <span className="font-bold text-white uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-zinc-500" /> Fees & Charges Breakdown
                    </span>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01] flex flex-col gap-2.5 font-mono">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Items Price Subtotal</span>
                        <span>{formatCurrency(drawerOrder.total_amount)}</span>
                      </div>
                      <div className="flex items-center justify-between text-red-400">
                        <span>Amazon Commission</span>
                        <span>{drawerOrder.profit_calculation_status === "unavailable" ? "Unavailable" : `-${formatCurrency(drawerOrder.commission_fees ?? 0)}`}</span>
                      </div>
                      <div className="flex items-center justify-between text-red-400">
                        <span>FBA Fulfillment Fees</span>
                        <span>{drawerOrder.profit_calculation_status === "unavailable" ? "Unavailable" : `-${formatCurrency(drawerOrder.fba_fees ?? 0)}`}</span>
                      </div>
                      <div className="flex items-center justify-between text-red-400">
                        <span>Fulfillment Shipping Cost</span>
                        <span>{drawerOrder.profit_calculation_status === "unavailable" ? "Unavailable" : `-${formatCurrency(drawerOrder.shipping_cost ?? 0)}`}</span>
                      </div>
                      <hr className="border-white/5" />
                      <div className="flex items-center justify-between font-bold text-white text-[13px]">
                        <span>Net Profit Yield</span>
                        <span className="text-[#00c48c]">{drawerOrder.profit_calculation_status === "complete" && drawerOrder.net_profit !== null ? formatCurrency(drawerOrder.net_profit) : "Unavailable"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Admin Notes */}
                  <div className="flex flex-col gap-2.5">
                    <span className="font-bold text-white uppercase text-[10px] tracking-wide">Internal Operational Notes</span>
                    <textarea
                      rows={3}
                      value={customNote}
                      onChange={(e) => setCustomNote(e.target.value)}
                      placeholder="Add packaging notes, customer support tracking details..."
                      className="w-full p-2.5 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-400 placeholder-zinc-600 resize-none"
                    />
                    <button
                      onClick={handleSaveNotes}
                      className="h-8 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs ml-auto transition-all"
                    >
                      Save Notes
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
