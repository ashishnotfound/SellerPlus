"use client";

import React, { useState, useMemo, useEffect } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { useToastStore } from "@/hooks/use-toast-store";
import { useListingsStore, Listing, ListingStatus, PerformanceBadge, ListingVersion } from "@/hooks/use-listings-store";
import { cn } from "@/lib/utils";
import { 
  Search, Filter, Grid, List, Plus, Settings, ChevronRight, X, Trash2, Edit3, History, 
  Tag, Download, FileJson, Printer, Check, CheckSquare, Square, AlertCircle, AlertTriangle,
  Award, Flame, TrendingUp, TrendingDown, RefreshCw, Layers, Sparkles, Image, CheckCircle, Save
} from "lucide-react";

export default function ListingsPage() {
  const user = useAuth((s) => s.user);
  const listings = useListingsStore((s) => s.listings);
  const versions = useListingsStore((s) => s.versions);
  const loading = useListingsStore((s) => s.loading);
  const loadListings = useListingsStore((s) => s.loadListings);
  const createListing = useListingsStore((s) => s.createListing);
  const updateListing = useListingsStore((s) => s.updateListing);
  const deleteListing = useListingsStore((s) => s.deleteListing);
  const restoreVersion = useListingsStore((s) => s.restoreVersion);
  const bulkPriceChange = useListingsStore((s) => s.bulkPriceChange);
  const bulkInventoryChange = useListingsStore((s) => s.bulkInventoryChange);
  const bulkKeywordUpdate = useListingsStore((s) => s.bulkKeywordUpdate);
  const bulkStatusChange = useListingsStore((s) => s.bulkStatusChange);
  const globalThresholds = useListingsStore((s) => s.globalThresholds);
  const setGlobalThresholds = useListingsStore((s) => s.setGlobalThresholds);
  const manualOverrides = useListingsStore((s) => s.manualOverrides);
  const setManualOverride = useListingsStore((s) => s.setManualOverride);
  const calculatePerformanceBadge = useListingsStore((s) => s.calculatePerformanceBadge);

  useEffect(() => {
    if (user?.id) {
      loadListings(user.id);
    }
  }, [user?.id, loadListings]);

  // UI State
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [selectedListings, setSelectedListings] = useState<string[]>([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Editor Modal
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [editorTab, setEditorTab] = useState<"id" | "content" | "images" | "attributes" | "pricing" | "history">("id");
  const [changeSummary, setChangeSummary] = useState("");

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSku, setNewSku] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPrice, setNewPrice] = useState(499);
  const [newChannel, setNewChannel] = useState<"amazon" | "flipkart" | "meesho" | "shopify">("amazon");

  // Version Comparison Modal
  const [selectedVersionA, setSelectedVersionA] = useState<string>("");
  const [selectedVersionB, setSelectedVersionB] = useState<string>("");
  const [comparingListingId, setComparingListingId] = useState<string | null>(null);

  // Settings Modal (Thresholds)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [thresholdInput, setThresholdInput] = useState({
    minSalesWinner: 25,
    minConvWinner: 12,
    lowStockLimit: 15,
    deadSalesLimit: 30
  });

  // Bulk Panel Action States
  const [bulkActionType, setBulkActionType] = useState<"price" | "inventory" | "keywords" | "status" | null>(null);
  const [bulkPriceMultiplier, setBulkPriceMultiplier] = useState(1.1); // e.g. +10%
  const [bulkInventoryQty, setBulkInventoryQty] = useState(50);
  const [bulkKeywordsInput, setBulkKeywordsInput] = useState("");
  const [bulkStatusSelect, setBulkStatusSelect] = useState<ListingStatus>("active");

  useEffect(() => {
    if (globalThresholds) {
      setThresholdInput(globalThresholds);
    }
  }, [globalThresholds]);

  // Category statistics counts
  const stats = useMemo(() => {
    const counts = {
      all: listings.length,
      active: listings.filter(l => l.status === "active").length,
      inactive: listings.filter(l => l.status === "inactive").length,
      draft: listings.filter(l => l.status === "draft").length,
      winners: listings.filter(l => calculatePerformanceBadge(l) === "winner").length,
      trending: listings.filter(l => calculatePerformanceBadge(l) === "trending").length,
      profitable: listings.filter(l => calculatePerformanceBadge(l) === "profitable").length,
      declining: listings.filter(l => calculatePerformanceBadge(l) === "declining").length,
      dead: listings.filter(l => calculatePerformanceBadge(l) === "dead").length,
      low_stock: listings.filter(l => calculatePerformanceBadge(l) === "low_stock").length,
      out_of_stock: listings.filter(l => calculatePerformanceBadge(l) === "out_of_stock").length,
    };
    return counts;
  }, [listings, calculatePerformanceBadge]);

  // Filters logic
  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      const matchSearch = 
        l.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
        l.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (l.asin && l.asin.toLowerCase().includes(searchQuery.toLowerCase()));

      const badge = calculatePerformanceBadge(l);
      let matchFilter = true;
      if (selectedFilter === "winners") matchFilter = (badge === "winner");
      else if (selectedFilter === "trending") matchFilter = (badge === "trending");
      else if (selectedFilter === "profitable") matchFilter = (badge === "profitable");
      else if (selectedFilter === "declining") matchFilter = (badge === "declining");
      else if (selectedFilter === "dead") matchFilter = (badge === "dead");
      else if (selectedFilter === "low_stock") matchFilter = (badge === "low_stock");
      else if (selectedFilter === "out_of_stock") matchFilter = (badge === "out_of_stock");
      else if (selectedFilter === "active") matchFilter = (l.status === "active");
      else if (selectedFilter === "inactive") matchFilter = (l.status === "inactive");
      else if (selectedFilter === "draft") matchFilter = (l.status === "draft");

      return matchSearch && matchFilter;
    });
  }, [listings, searchQuery, selectedFilter, calculatePerformanceBadge]);

  // Paginated Listings
  const paginatedListings = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredListings.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredListings, currentPage]);

  const totalPages = Math.ceil(filteredListings.length / itemsPerPage);

  const handleSelectAll = () => {
    if (selectedListings.length === filteredListings.length) {
      setSelectedListings([]);
    } else {
      setSelectedListings(filteredListings.map(l => l.id));
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedListings(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Editor Actions
  const handleOpenEditor = (l: Listing) => {
    setEditingListing(JSON.parse(JSON.stringify(l))); // Deep copy for sandboxed edits
    setEditorTab("id");
    setChangeSummary("Updated listing details");
  };

  const handleSaveEditor = async () => {
    if (!editingListing) return;
    await updateListing(editingListing.id, editingListing, changeSummary || "Listing updated");
    setEditingListing(null);
    setChangeSummary("");
  };

  const handleCreateListing = async () => {
    if (!newSku || !newTitle) {
      useToastStore.getState().warning("Validation Error", "Please fill out both Sku and Title fields.");
      return;
    }
    const row = await createListing({
      sku: newSku,
      title: newTitle,
      price: Number(newPrice),
      channel: newChannel,
      status: "draft"
    });
    if (row) {
      setIsCreateOpen(false);
      setNewSku("");
      setNewTitle("");
      setNewPrice(499);
    }
  };

  // Bulk modifiers
  const handleApplyBulkAction = async () => {
    if (selectedListings.length === 0) return;
    if (bulkActionType === "price") {
      await bulkPriceChange(selectedListings, bulkPriceMultiplier);
    } else if (bulkActionType === "inventory") {
      await bulkInventoryChange(selectedListings, bulkInventoryQty);
    } else if (bulkActionType === "keywords") {
      const keywordsArray = bulkKeywordsInput.split(",").map(k => k.trim()).filter(Boolean);
      await bulkKeywordUpdate(selectedListings, keywordsArray);
    } else if (bulkActionType === "status") {
      await bulkStatusChange(selectedListings, bulkStatusSelect);
    }
    setSelectedListings([]);
    setBulkActionType(null);
    useToastStore.getState().success("Success", "Bulk updates applied successfully.");
  };

  // Version Restore Action
  const handleRestoreVersion = async (listingId: string, versionId: string) => {
    if (confirm("Are you sure you want to roll back this listing to this snapshot?")) {
      await restoreVersion(listingId, versionId);
      // Reload active editing listings view
      const fresh = listings.find(l => l.id === listingId);
      if (fresh) setEditingListing(fresh);
      useToastStore.getState().success("Restored", "Restored successfully!");
    }
  };

  // Export handlers
  const handleExportJSON = (singleId?: string) => {
    const targets = singleId ? listings.filter(l => l.id === singleId) : listings.filter(l => selectedListings.includes(l.id));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(targets, null, 2));
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `listings_export_${Date.now()}.json`);
    dlAnchorElem.click();
  };

  const handleExportCSV = (singleId?: string) => {
    const targets = singleId ? listings.filter(l => l.id === singleId) : listings.filter(l => selectedListings.includes(l.id));
    const headers = [
      "SKU", "ASIN", "Title", "Channel", "Price", "Sale Price", "Available Stock", 
      "Reserved Stock", "Incoming Stock", "Reorder Threshold", "Fulfillment Mode", 
      "Status", "Category Badge", "Sales 30d", "Revenue 30d", "Orders 30d", "SEO Score"
    ];
    
    const rows = targets.map(l => [
      l.sku, l.asin || "", l.title, l.channel, l.price, l.sale_price || "", l.available_qty,
      l.reserved_qty, l.incoming_qty, l.reorder_qty, l.fulfillment_channel,
      l.status, calculatePerformanceBadge(l), l.sales_30d, l.revenue_30d, l.orders_30d, l.seo_score
    ]);

    let csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(",")].concat(rows.map(r => r.map(val => {
        if (typeof val === 'string' && val.includes(',')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(","))).join("\n");

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `listings_${Date.now()}.csv`);
    link.click();
  };

  const handleExportExcel = (singleId?: string) => {
    // Generates a XML workbook payload compatible with Excel
    const targets = singleId ? listings.filter(l => l.id === singleId) : listings.filter(l => selectedListings.includes(l.id));
    const headers = [
      "SKU", "ASIN", "Title", "Fulfillment", "Price", "Sale Price", "Stock Available", "Fulfillment Mode", "Badge", "Revenue 30d"
    ];
    
    let excelContent = "SKU\tASIN\tTitle\tFulfillment\tPrice\tSale Price\tStock Available\tMode\tBadge\tRevenue\n";
    targets.forEach(l => {
      excelContent += `${l.sku}\t${l.asin || ""}\t${l.title.replace(/\n|\t/g, " ")}\t${l.fulfillment_channel}\t${l.price}\t${l.sale_price || ""}\t${l.available_qty}\t${l.fulfillment_channel}\t${calculatePerformanceBadge(l)}\t${l.revenue_30d}\n`;
    });

    const link = document.createElement("a");
    link.setAttribute("href", "data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent(excelContent));
    link.setAttribute("download", `listings_${Date.now()}.xls`);
    link.click();
  };

  const handleExportPDF = (singleId?: string) => {
    const targets = singleId ? listings.filter(l => l.id === singleId) : listings.filter(l => selectedListings.includes(l.id));
    if (targets.length === 0) {
      useToastStore.getState().warning("No Selection", "Please select one or more listings to export to PDF.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let html = `
      <html>
        <head>
          <title>SellerPlus Listings Report</title>
          <style>
            body { font-family: 'Segoe UI', Roboto, sans-serif; background-color: #f4f5f7; color: #1e293b; padding: 24px; line-height: 1.5; }
            h1 { font-size: 24px; font-weight: bold; border-bottom: 2px solid #6366f1; padding-bottom: 8px; margin-bottom: 24px; color: #0f172a; }
            .toc { background: #fff; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 30px; }
            .toc h2 { font-size: 16px; margin-top: 0; color: #475569; }
            .toc-item { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
            .listing-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); page-break-inside: avoid; }
            .header-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 16px; }
            .title { font-size: 16px; font-weight: bold; color: #0f172a; }
            .meta { font-size: 11px; font-family: monospace; color: #64748b; margin-top: 4px; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 9px; font-weight: bold; text-transform: uppercase; background: #e0e7ff; color: #4338ca; }
            .badge.winner { background: #d1fae5; color: #065f46; }
            .badge.low_stock { background: #fef3c7; color: #92400e; }
            .badge.out_of_stock { background: #fee2e2; color: #991b1b; }
            .grid-spec { display: grid; grid-template-cols: 1fr 1fr; gap: 16px; font-size: 12px; margin-bottom: 16px; }
            .grid-spec div { padding: 8px; background: #f8fafc; border-radius: 6px; }
            .grid-spec span { font-weight: bold; color: #334155; }
            .bullets-box { font-size: 11px; color: #475569; background: #f8fafc; padding: 12px; border-radius: 6px; margin-top: 12px; }
            .bullets-box ul { margin: 6px 0; padding-left: 18px; }
            .footer-info { text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 40px; }
            .page-num::before { content: counter(page); }
          </style>
        </head>
        <body>
          <h1>SellerPlus Listings Inventory Report - ${new Date().toLocaleDateString()}</h1>
          
          <div class="toc">
            <h2>Table of Contents</h2>
            ${targets.map((t, idx) => `
              <div class="toc-item">
                <span>Section ${idx + 1}: SKU ${t.sku} (${t.title.substring(0, 40)}...)</span>
                <span>ASIN: ${t.asin || "N/A"}</span>
              </div>
            `).join("")}
          </div>

          ${targets.map((t, idx) => `
            <div class="listing-card">
              <div class="header-row">
                <div>
                  <div class="title">${idx + 1}. ${t.title}</div>
                  <div class="meta">ASIN: ${t.asin || "N/A"} | SKU: ${t.sku} | FNSKU: ${t.fnsku || "N/A"} | Brand: ${t.brand || "N/A"}</div>
                </div>
                <div>
                  <span class="badge ${calculatePerformanceBadge(t) || 'no-data'}">${calculatePerformanceBadge(t) || 'N/A'}</span>
                  <span class="badge" style="background:#f1f5f9;color:#334155;margin-left:4px;">${t.status.toUpperCase()}</span>
                </div>
              </div>

              <div class="grid-spec">
                <div>
                  <strong>Financial & Performance Metrics:</strong><br/>
                  Price: <span>₹${t.price.toLocaleString("en-IN")}</span><br/>
                  Sale Price: <span>₹${(t.sale_price || t.price).toLocaleString("en-IN")}</span><br/>
                  30d Sales Qty: <span>${t.sales_30d !== null && t.sales_30d !== undefined ? t.sales_30d + ' units' : 'N/A'}</span><br/>
                  30d Revenue: <span>${t.revenue_30d !== null && t.revenue_30d !== undefined ? '₹' + t.revenue_30d.toLocaleString("en-IN") : 'N/A'}</span><br/>
                  Conversion Rate: <span>${t.conversion_rate_30d !== null && t.conversion_rate_30d !== undefined ? t.conversion_rate_30d + '%' : 'N/A'}</span>
                </div>
                <div>
                  <strong>Inventory & Attributes:</strong><br/>
                  Available Quantity: <span>${t.available_qty} units</span><br/>
                  Fulfillment Mode: <span>${t.fulfillment_channel}</span><br/>
                  Color / Size: <span>${t.color || "N/A"} / ${t.size || "N/A"}</span><br/>
                  Dimensions: <span>${t.dimensions || "N/A"}</span><br/>
                  SEO Score: <span>${t.seo_score !== null && t.seo_score !== undefined ? t.seo_score + '/100' : 'N/A'}</span>
                </div>
              </div>

              <div>
                <strong>Description Preview:</strong>
                <p style="font-size: 11px; color:#475569; margin: 4px 0 0 0;">${t.description || "No description provided."}</p>
              </div>

              ${t.bullet_points && t.bullet_points.length > 0 ? `
                <div class="bullets-box">
                  <strong>Key Product Features (Bullet Points):</strong>
                  <ul>
                    ${t.bullet_points.map(bullet => `<li>${bullet}</li>`).join("")}
                  </ul>
                </div>
              ` : ""}
            </div>
          `).join("")}

          <div class="footer-info">
            Generated via SellerPlus Master Catalog | Date: ${new Date().toLocaleString()} | Page 1 of 1
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="flex flex-col gap-8 pb-20">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Layers className="w-8 h-8 text-indigo-400" /> Listings Management
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Amazon SP-API catalog synchronization, content snapshot editing, bulk pricing tools, and smart SEO scoring.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="h-11 w-11 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-300 flex items-center justify-center transition-all"
            title="Configure category thresholds"
          >
            <Settings className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => setIsCreateOpen(true)}
            className="h-11 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-emerald-500 hover:opacity-95 text-white font-bold text-sm flex items-center gap-2 transition-all shadow-md shadow-indigo-500/10"
          >
            <Plus className="w-4 h-4" /> New Listing
          </button>
        </div>
      </div>

      {/* Performance Categories Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <GlassCard 
          onClick={() => setSelectedFilter("all")}
          className={cn(
            "p-3 flex flex-col justify-between cursor-pointer border hover:border-white/10 transition-all",
            selectedFilter === "all" ? "border-indigo-500/40 bg-indigo-500/5" : "border-white/5"
          )}
        >
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">All Catalog</span>
          <span className="text-2xl font-black text-white mt-1">{stats.all}</span>
        </GlassCard>

        <GlassCard 
          onClick={() => setSelectedFilter("winners")}
          className={cn(
            "p-3 flex flex-col justify-between cursor-pointer border hover:border-white/10 transition-all",
            selectedFilter === "winners" ? "border-indigo-500/40 bg-indigo-500/5" : "border-white/5"
          )}
        >
          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
            🏆 Winners
          </span>
          <span className="text-2xl font-black text-emerald-400 mt-1">{stats.winners}</span>
        </GlassCard>

        <GlassCard 
          onClick={() => setSelectedFilter("trending")}
          className={cn(
            "p-3 flex flex-col justify-between cursor-pointer border hover:border-white/10 transition-all",
            selectedFilter === "trending" ? "border-indigo-500/40 bg-indigo-500/5" : "border-white/5"
          )}
        >
          <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1">
            🚀 Trending
          </span>
          <span className="text-2xl font-black text-indigo-400 mt-1">{stats.trending}</span>
        </GlassCard>

        <GlassCard 
          onClick={() => setSelectedFilter("profitable")}
          className={cn(
            "p-3 flex flex-col justify-between cursor-pointer border hover:border-white/10 transition-all",
            selectedFilter === "profitable" ? "border-indigo-500/40 bg-indigo-500/5" : "border-white/5"
          )}
        >
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
            💰 Profitable
          </span>
          <span className="text-2xl font-black text-amber-400 mt-1">{stats.profitable}</span>
        </GlassCard>

        <GlassCard 
          onClick={() => setSelectedFilter("low_stock")}
          className={cn(
            "p-3 flex flex-col justify-between cursor-pointer border hover:border-white/10 transition-all",
            selectedFilter === "low_stock" ? "border-indigo-500/40 bg-indigo-500/5" : "border-white/5"
          )}
        >
          <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1">
            📦 Low Stock
          </span>
          <span className="text-2xl font-black text-rose-400 mt-1">{stats.low_stock}</span>
        </GlassCard>

        <GlassCard 
          onClick={() => setSelectedFilter("out_of_stock")}
          className={cn(
            "p-3 flex flex-col justify-between cursor-pointer border hover:border-white/10 transition-all",
            selectedFilter === "out_of_stock" ? "border-indigo-500/40 bg-indigo-500/5" : "border-white/5"
          )}
        >
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1">
            ⚠️ OOS
          </span>
          <span className="text-2xl font-black text-zinc-400 mt-1">{stats.out_of_stock}</span>
        </GlassCard>
      </div>

      {/* Control ribbon */}
      <GlassCard className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 items-center w-full md:w-auto">
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by SKU, Title, ASIN..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Quick Filters presets */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5 overflow-x-auto w-full sm:w-auto">
            {([
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "inactive", label: "Inactive" },
              { key: "draft", label: "Draft" },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => { setSelectedFilter(f.key); setCurrentPage(1); }}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap",
                  selectedFilter === f.key
                    ? "bg-indigo-500 text-white"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {/* Multi-select Export options */}
          {selectedListings.length > 0 && (
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-[10px] text-zinc-400 font-bold mr-1">{selectedListings.length} Selected:</span>
              <button 
                onClick={() => handleExportCSV()}
                className="h-8 px-2.5 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 font-bold text-[10px] flex items-center gap-1 transition-all"
                title="Export selected as CSV"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button 
                onClick={() => handleExportExcel()}
                className="h-8 px-2.5 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 font-bold text-[10px] flex items-center gap-1 transition-all"
                title="Export selected as Excel"
              >
                <Layers className="w-3.5 h-3.5" /> Excel
              </button>
              <button 
                onClick={() => handleExportPDF()}
                className="h-8 px-2.5 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 font-bold text-[10px] flex items-center gap-1 transition-all"
                title="Print selected to PDF"
              >
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
              <button 
                onClick={() => handleExportJSON()}
                className="h-8 px-2.5 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 font-bold text-[10px] flex items-center gap-1 transition-all"
                title="Export selected as JSON"
              >
                <FileJson className="w-3.5 h-3.5" /> JSON
              </button>
            </div>
          )}

          {/* Layout buttons */}
          <div className="flex items-center gap-0.5 border border-white/10 rounded-lg p-0.5 bg-white/[0.02]">
            <button
              onClick={() => setViewMode("table")}
              className={cn("p-1.5 rounded-md transition-all", viewMode === "table" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("card")}
              className={cn("p-1.5 rounded-md transition-all", viewMode === "card" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Main Grid View */}
      {loading ? (
        <div className="py-20 text-center text-zinc-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-400" />
          <p className="text-xs">Loading listings catalog...</p>
        </div>
      ) : filteredListings.length === 0 ? (
        <GlassCard className="py-20 text-center border-dashed border-white/10 flex flex-col items-center justify-center">
          <Tag className="w-12 h-12 text-zinc-600 mb-4" />
          <h4 className="text-base font-bold text-white mb-2">No Matching Listings Found</h4>
          <p className="text-xs text-zinc-500 max-w-sm mb-6">
            We couldn't find any listings matching query "{searchQuery}" under filter "{selectedFilter}". Add a new listing or adjust parameters.
          </p>
        </GlassCard>
      ) : viewMode === "table" ? (
        <GlassCard className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 font-semibold h-10 uppercase tracking-wider text-[10px]">
                  <th className="w-10">
                    <button onClick={handleSelectAll} className="text-zinc-500 hover:text-white">
                      {selectedListings.length === filteredListings.length ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th>SKU / ASIN</th>
                  <th>Product details</th>
                  <th>Mode</th>
                  <th className="text-right">Price</th>
                  <th className="text-center">Stock</th>
                  <th className="text-center">Status</th>
                  <th>Perf Badge</th>
                  <th className="text-right">Orders (30d)</th>
                  <th className="text-right">Revenue (30d)</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium text-zinc-300">
                {paginatedListings.map((l) => {
                  const badge = calculatePerformanceBadge(l);
                  return (
                    <tr key={l.id} className="h-14 hover:bg-white/[0.01] transition-colors">
                      <td>
                        <button onClick={() => handleSelectOne(l.id)} className="text-zinc-500 hover:text-white">
                          {selectedListings.includes(l.id) ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-white text-xs">{l.sku}</span>
                          <span className="text-[10px] text-zinc-500 font-mono mt-0.5">ASIN: {l.asin || "Pending"}</span>
                        </div>
                      </td>
                      <td className="max-w-[200px] pr-4">
                        <div className="flex items-center gap-2 py-1">
                          {l.main_image ? (
                            <img src={l.main_image} alt="" className="w-8 h-8 rounded bg-white/5 object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center shrink-0">
                              <Image className="w-4 h-4 text-zinc-500" />
                            </div>
                          )}
                          <span className="truncate block font-semibold text-zinc-200" title={l.title}>
                            {l.title}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {l.fulfillment_channel}
                        </span>
                      </td>
                      <td className="text-right font-mono font-bold text-white">
                        ₹{l.price.toLocaleString("en-IN")}
                      </td>
                      <td className="text-center font-mono">
                        <div className="flex flex-col items-center">
                          <span className={cn(
                            "font-bold",
                            l.available_qty === 0 ? "text-rose-500 font-black" : l.available_qty < 15 ? "text-amber-400" : "text-emerald-400"
                          )}>
                            {l.available_qty}
                          </span>
                          <span className="text-[8px] text-zinc-500 uppercase font-extrabold tracking-wider mt-0.5">Available</span>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider",
                          l.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                          l.status === "inactive" ? "bg-rose-500/10 text-rose-400" :
                          "bg-zinc-500/10 text-zinc-400"
                        )}>
                          {l.status}
                        </span>
                      </td>
                      <td>
                        <span className={cn(
                          "text-[9px] font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1 w-max",
                          badge === "winner" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          badge === "low_stock" || badge === "out_of_stock" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                          badge === "profitable" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                          "bg-zinc-800 text-zinc-400"
                        )}>
                          {badge === "winner" && "🏆 Winner"}
                          {badge === "trending" && "🚀 Trending"}
                          {badge === "profitable" && "💰 Profit"}
                          {badge === "low_stock" && "📦 Low Stock"}
                          {badge === "out_of_stock" && "💀 OOS"}
                          {badge === "working" && "💼 Working"}
                          {badge === "dead" && "💀 Dead"}
                          {badge === "declining" && "⚠️ Declining"}
                          {badge === "sleeping" && "💤 Sleeping"}
                          {!badge && "N/A"}
                        </span>
                      </td>
                      <td className="text-right font-mono font-bold text-zinc-400">
                        {l.orders_30d !== null && l.orders_30d !== undefined ? l.orders_30d.toLocaleString("en-IN") : "N/A"}
                      </td>
                      <td className="text-right font-mono font-bold text-white">
                        {l.revenue_30d !== null && l.revenue_30d !== undefined ? `₹${l.revenue_30d.toLocaleString("en-IN")}` : "N/A"}
                      </td>
                      <td>
                        <div className="flex items-center gap-1 justify-end">
                          <button 
                            onClick={() => handleOpenEditor(l)}
                            className="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-white transition-all"
                            title="Edit Listing Attributes"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => { if (confirm("Delete this listing?")) deleteListing(l.id); }}
                            className="p-1.5 rounded hover:bg-white/5 text-zinc-500 hover:text-rose-400 transition-all"
                            title="Delete Listing"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : (
        /* Card view grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {paginatedListings.map((l) => {
            const badge = calculatePerformanceBadge(l);
            return (
              <GlassCard key={l.id} className="p-4 flex flex-col justify-between group hover:border-white/10 transition-all border border-white/5">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[8px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {l.fulfillment_channel}
                    </span>
                    <span className={cn(
                      "text-[9px] font-bold px-2 py-0.5 rounded uppercase",
                      badge === "winner" ? "bg-emerald-500/10 text-emerald-400" :
                      badge === "low_stock" || badge === "out_of_stock" ? "bg-rose-500/10 text-rose-400" :
                      "bg-zinc-800 text-zinc-400"
                    )}>
                      {badge ? (badge === "winner" ? "🏆 Winner" : badge.replace("_", " ")) : "N/A"}
                    </span>
                  </div>

                  {l.main_image ? (
                    <img src={l.main_image} alt="" className="w-full h-32 rounded-lg object-cover mb-3 bg-white/5" />
                  ) : (
                    <div className="w-full h-32 rounded-lg bg-white/5 flex items-center justify-center mb-3">
                      <Image className="w-8 h-8 text-zinc-600" />
                    </div>
                  )}

                  <h3 className="font-bold text-white text-xs truncate" title={l.title}>{l.title}</h3>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[10px] text-zinc-500 font-mono">ASIN: {l.asin || "N/A"}</span>
                    <span className="text-[10px] font-bold text-indigo-400 font-mono">{l.sku}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/5 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block">Price:</span>
                      <span className="font-bold text-white">₹{l.price.toLocaleString("en-IN")}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Available Stock:</span>
                      <span className={cn(
                        "font-bold",
                        l.available_qty < 15 ? "text-rose-400" : "text-emerald-400"
                      )}>{l.available_qty} units</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">Revenue: <span className="font-mono text-zinc-300 font-semibold">{l.revenue_30d !== null && l.revenue_30d !== undefined ? `₹${l.revenue_30d.toLocaleString("en-IN")}` : "N/A"}</span></span>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleOpenEditor(l)}
                      className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => { if (confirm("Delete this listing?")) deleteListing(l.id); }}
                      className="p-1.5 rounded hover:bg-white/10 text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-white/5 pt-4">
          <span className="text-xs text-zinc-500">
            Showing page {currentPage} of {totalPages} ({filteredListings.length} total items)
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="h-8 px-3 rounded-lg border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent text-xs transition-all"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="h-8 px-3 rounded-lg border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent text-xs transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Sliding Bulk Action Footer Panel */}
      {selectedListings.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between w-[92vw] max-w-4xl transition-all">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 animate-pulse" />
            <div>
              <div className="text-xs font-bold text-white">{selectedListings.length} Listings Selected</div>
              <div className="text-[10px] text-zinc-500">Modify selected variables in bulk</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <select
              value={bulkActionType || ""}
              onChange={(e) => setBulkActionType(e.target.value as any || null)}
              className="h-9 px-3 rounded-xl border border-white/10 bg-zinc-900 text-white text-xs focus:outline-none"
            >
              <option value="">Select Bulk Action...</option>
              <option value="price">Change Price</option>
              <option value="inventory">Set Stock Qty</option>
              <option value="keywords">Add Keywords</option>
              <option value="status">Change Status</option>
            </select>

            {/* Price change sub-input */}
            {bulkActionType === "price" && (
              <input
                type="number"
                step="0.05"
                placeholder="Multiplier e.g. 0.95 (5% off)"
                value={bulkPriceMultiplier}
                onChange={(e) => setBulkPriceMultiplier(Number(e.target.value))}
                className="h-9 w-28 px-3 rounded-xl border border-white/10 bg-zinc-900 text-white text-xs"
              />
            )}

            {/* Inventory change sub-input */}
            {bulkActionType === "inventory" && (
              <input
                type="number"
                placeholder="Available qty e.g. 50"
                value={bulkInventoryQty}
                onChange={(e) => setBulkInventoryQty(Number(e.target.value))}
                className="h-9 w-28 px-3 rounded-xl border border-white/10 bg-zinc-900 text-white text-xs"
              />
            )}

            {/* Keywords append sub-input */}
            {bulkActionType === "keywords" && (
              <input
                type="text"
                placeholder="Comma separated: tags, promo"
                value={bulkKeywordsInput}
                onChange={(e) => setBulkKeywordsInput(e.target.value)}
                className="h-9 w-40 px-3 rounded-xl border border-white/10 bg-zinc-900 text-white text-xs"
              />
            )}

            {/* Status change sub-select */}
            {bulkActionType === "status" && (
              <select
                value={bulkStatusSelect}
                onChange={(e) => setBulkStatusSelect(e.target.value as any)}
                className="h-9 px-3 rounded-xl border border-white/10 bg-zinc-900 text-white text-xs"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="draft">Draft</option>
              </select>
            )}

            {bulkActionType && (
              <button 
                onClick={handleApplyBulkAction}
                className="h-9 px-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs transition-all"
              >
                Apply Updates
              </button>
            )}

            <button 
              onClick={() => setSelectedListings([])}
              className="h-9 w-9 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Threshold Overrides Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassCard className="w-full max-w-md p-6 relative">
            <button 
              onClick={() => setIsSettingsOpen(false)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-400" /> Threshold Parameters
            </h3>
            <p className="text-zinc-500 text-xs mb-6">Configure criteria levels for automatic performance badge classification.</p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400">Min 30d Sales (🏆 Winner)</label>
                <input 
                  type="number"
                  value={thresholdInput.minSalesWinner}
                  onChange={(e) => setThresholdInput(p => ({ ...p, minSalesWinner: Number(e.target.value) }))}
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400">Min 30d Conversion % (🏆 Winner)</label>
                <input 
                  type="number"
                  value={thresholdInput.minConvWinner}
                  onChange={(e) => setThresholdInput(p => ({ ...p, minConvWinner: Number(e.target.value) }))}
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400">Low Stock Limit (Units)</label>
                <input 
                  type="number"
                  value={thresholdInput.lowStockLimit}
                  onChange={(e) => setThresholdInput(p => ({ ...p, lowStockLimit: Number(e.target.value) }))}
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400">Dead Days Limit</label>
                <input 
                  type="number"
                  value={thresholdInput.deadSalesLimit}
                  onChange={(e) => setThresholdInput(p => ({ ...p, deadSalesLimit: Number(e.target.value) }))}
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-1/2 h-10 rounded-xl border border-white/10 text-zinc-400 hover:text-white text-xs transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setGlobalThresholds(thresholdInput);
                  setIsSettingsOpen(false);
                  useToastStore.getState().success("Saved", "Threshold configurations updated.");
                }}
                className="w-1/2 h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs transition-all"
              >
                Save Config
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* New Listing Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassCard className="w-full max-w-md p-6 relative border border-white/10 shadow-2xl">
            <button onClick={() => setIsCreateOpen(false)} className="absolute right-4 top-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" /> Map New Listing SKU
            </h3>
            <p className="text-zinc-500 text-xs mb-6">Initialize a draft product layout mapping inside your catalog.</p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400">Master SKU Code</label>
                <input 
                  type="text"
                  placeholder="e.g. MIKU-POSTER-A3"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value.toUpperCase())}
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs uppercase"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-400">Product Title</label>
                <input 
                  type="text"
                  placeholder="Hatsune Miku Stage Concert Poster"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Base Price (INR)</label>
                  <input 
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-400">Channel</label>
                  <select 
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value as any)}
                    className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-zinc-900 text-white text-xs focus:outline-none"
                  >
                    <option value="amazon">Amazon</option>
                    <option value="shopify">Shopify</option>
                    <option value="meesho">Meesho</option>
                    <option value="flipkart">Flipkart</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setIsCreateOpen(false)}
                className="w-1/2 h-10 rounded-xl border border-white/10 text-zinc-400 hover:text-white text-xs transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateListing}
                className="w-1/2 h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs transition-all"
              >
                Create Listing
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Editor Drawer Modal (Right slide) */}
      {editingListing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-3xl bg-zinc-950/90 backdrop-blur-2xl border-l border-white/10 h-full flex flex-col p-6 shadow-2xl relative animate-in slide-in-from-right duration-250">
            {/* Header controls */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
              <div>
                <span className="text-[10px] uppercase font-extrabold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  SKU: {editingListing.sku}
                </span>
                <h3 className="text-lg font-black text-white mt-1.5 truncate max-w-md" title={editingListing.title}>
                  Edit Listing Attributes
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={handleSaveEditor}
                  className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-2 transition-all"
                >
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </button>
                <button 
                  onClick={() => setEditingListing(null)}
                  className="h-10 w-10 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-400 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Custom change description input */}
            <div className="mb-4">
              <label className="text-[9px] uppercase font-black text-zinc-500 tracking-wider">Change Log Reason Summary</label>
              <input
                type="text"
                placeholder="e.g. Optimized backend bullet descriptors for search velocity indexers"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
              />
            </div>

            {/* Editor Tabs Navigation */}
            <div className="flex items-center gap-1 border-b border-white/5 pb-2 mb-6 overflow-x-auto">
              {([
                { key: "id", label: "Identity" },
                { key: "content", label: "Copywriting" },
                { key: "images", label: "Gallery" },
                { key: "attributes", label: "Physical Specs" },
                { key: "pricing", label: "Pricing & Stock" },
                { key: "history", label: "Versions" }
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setEditorTab(t.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap",
                    editorTab === t.key ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              {editorTab === "id" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">ASIN Identifier</label>
                      <input 
                        type="text" 
                        value={editingListing.asin || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, asin: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">FNSKU Barcode</label>
                      <input 
                        type="text" 
                        value={editingListing.fnsku || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, fnsku: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Parent ASIN</label>
                      <input 
                        type="text" 
                        value={editingListing.parent_asin || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, parent_asin: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Brand Name</label>
                      <input 
                        type="text" 
                        value={editingListing.brand || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, brand: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Manufacturer</label>
                      <input 
                        type="text" 
                        value={editingListing.manufacturer || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, manufacturer: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Product Type Category</label>
                      <input 
                        type="text" 
                        value={editingListing.product_type || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, product_type: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editorTab === "content" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-500">Listing Product Title</label>
                    <textarea 
                      rows={2}
                      value={editingListing.title}
                      onChange={(e) => setEditingListing(p => p ? { ...p, title: e.target.value } : null)}
                      className="w-full mt-1 p-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-500">Product Description Text</label>
                    <textarea 
                      rows={4}
                      value={editingListing.description || ""}
                      onChange={(e) => setEditingListing(p => p ? { ...p, description: e.target.value } : null)}
                      className="w-full mt-1 p-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Bullet Features</label>
                      <button 
                        onClick={() => setEditingListing(p => p ? { ...p, bullet_points: [...(p.bullet_points || []), ""] } : null)}
                        className="text-[9px] uppercase font-extrabold text-indigo-400 hover:text-indigo-300"
                      >
                        + Add Bullet
                      </button>
                    </div>
                    
                    <div className="space-y-2 mt-1.5">
                      {editingListing.bullet_points?.map((bullet, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <input 
                            type="text" 
                            value={bullet} 
                            onChange={(e) => {
                              const list = [...(editingListing.bullet_points || [])];
                              list[idx] = e.target.value;
                              setEditingListing(p => p ? { ...p, bullet_points: list } : null);
                            }}
                            className="flex-1 h-9 px-3 rounded-lg border border-white/5 bg-white/[0.01] text-white text-xs"
                          />
                          <button 
                            onClick={() => {
                              const list = (editingListing.bullet_points || []).filter((_, i) => i !== idx);
                              setEditingListing(p => p ? { ...p, bullet_points: list } : null);
                            }}
                            className="p-2 text-zinc-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Target Audience</label>
                      <input 
                        type="text" 
                        value={editingListing.target_audience || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, target_audience: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Subject Matter</label>
                      <input 
                        type="text" 
                        value={editingListing.subject_matter || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, subject_matter: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editorTab === "images" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-500">Main Hero Image URL</label>
                    <div className="flex gap-2 mt-1">
                      <input 
                        type="text" 
                        value={editingListing.main_image || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, main_image: e.target.value } : null)}
                        className="flex-1 h-10 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                      {editingListing.main_image && (
                        <img src={editingListing.main_image} alt="" className="w-10 h-10 rounded object-cover border border-white/10" />
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Gallery Alternates URLs</label>
                      <button 
                        onClick={() => setEditingListing(p => p ? { ...p, gallery_images: [...(p.gallery_images || []), ""] } : null)}
                        className="text-[9px] uppercase font-extrabold text-indigo-400 hover:text-indigo-300"
                      >
                        + Add Image URL
                      </button>
                    </div>

                    <div className="space-y-2 mt-2">
                      {editingListing.gallery_images?.map((img, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <input 
                            type="text" 
                            value={img} 
                            onChange={(e) => {
                              const list = [...(editingListing.gallery_images || [])];
                              list[idx] = e.target.value;
                              setEditingListing(p => p ? { ...p, gallery_images: list } : null);
                            }}
                            className="flex-1 h-9 px-3 rounded-lg border border-white/5 bg-white/[0.01] text-white text-xs"
                          />
                          {img && (
                            <img src={img} alt="" className="w-8 h-8 rounded object-cover" />
                          )}
                          <button 
                            onClick={() => {
                              const list = (editingListing.gallery_images || []).filter((_, i) => i !== idx);
                              setEditingListing(p => p ? { ...p, gallery_images: list } : null);
                            }}
                            className="p-2 text-zinc-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {editorTab === "attributes" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Color Spec</label>
                      <input 
                        type="text" 
                        value={editingListing.color || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, color: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Size Spec</label>
                      <input 
                        type="text" 
                        value={editingListing.size || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, size: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Material Specification</label>
                      <input 
                        type="text" 
                        value={editingListing.material || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, material: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Dimensions (L x W x H)</label>
                      <input 
                        type="text" 
                        value={editingListing.dimensions || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, dimensions: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Item Weight</label>
                      <input 
                        type="text" 
                        value={editingListing.weight || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, weight: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Country of Origin</label>
                      <input 
                        type="text" 
                        value={editingListing.country_of_origin || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, country_of_origin: e.target.value } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editorTab === "pricing" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Standard Price (INR)</label>
                      <input 
                        type="number" 
                        value={editingListing.price} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, price: Number(e.target.value) } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Promo Sale Price</label>
                      <input 
                        type="number" 
                        value={editingListing.sale_price || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, sale_price: Number(e.target.value) } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Business Price</label>
                      <input 
                        type="number" 
                        value={editingListing.business_price || ""} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, business_price: Number(e.target.value) } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Available Stock</label>
                      <input 
                        type="number" 
                        value={editingListing.available_qty} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, available_qty: Number(e.target.value) } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Reserved</label>
                      <input 
                        type="number" 
                        value={editingListing.reserved_qty} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, reserved_qty: Number(e.target.value) } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Incoming</label>
                      <input 
                        type="number" 
                        value={editingListing.incoming_qty} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, incoming_qty: Number(e.target.value) } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Reorder Lvl</label>
                      <input 
                        type="number" 
                        value={editingListing.reorder_qty} 
                        onChange={(e) => setEditingListing(p => p ? { ...p, reorder_qty: Number(e.target.value) } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Fulfillment Mode</label>
                      <select
                        value={editingListing.fulfillment_channel}
                        onChange={(e) => setEditingListing(p => p ? { ...p, fulfillment_channel: e.target.value as any } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-zinc-900 text-white text-xs"
                      >
                        <option value="FBA">Amazon FBA (Fulfilled by Amazon)</option>
                        <option value="FBM">Merchant FBM (Fulfilled by Merchant)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-zinc-500">Status</label>
                      <select
                        value={editingListing.status}
                        onChange={(e) => setEditingListing(p => p ? { ...p, status: e.target.value as any } : null)}
                        className="w-full h-10 mt-1 px-3 rounded-xl border border-white/10 bg-zinc-900 text-white text-xs"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="draft">Draft</option>
                        <option value="suppressed">Suppressed</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {editorTab === "history" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs text-zinc-400 font-bold">Snapshot History Log ({versions[editingListing.id]?.length || 0})</span>
                    {versions[editingListing.id]?.length >= 2 && (
                      <button
                        onClick={() => {
                          const vers = versions[editingListing.id];
                          setComparingListingId(editingListing.id);
                          setSelectedVersionA(vers[0].id);
                          setSelectedVersionB(vers[1].id);
                        }}
                        className="text-[9px] uppercase font-extrabold text-indigo-400 hover:text-indigo-300"
                      >
                        Compare Diff Snapshots
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {(versions[editingListing.id] || []).map((v) => (
                      <div key={v.id} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">Version #{v.versionNumber}</span>
                            <span className="text-[9px] text-zinc-500 uppercase font-extrabold">By: {v.userAction}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-1">Summary: {v.changeSummary}</p>
                          <span className="text-[9px] text-zinc-600 block mt-1">{new Date(v.createdAt).toLocaleString()}</span>
                        </div>
                        <button
                          onClick={() => handleRestoreVersion(editingListing.id, v.id)}
                          className="h-8 px-3 rounded-lg border border-white/10 hover:bg-indigo-500/20 hover:border-indigo-500/30 text-indigo-400 font-bold text-[10px] transition-all"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version Comparison Modal overlay */}
      {comparingListingId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassCard className="w-full max-w-4xl p-6 relative flex flex-col h-[80vh] border border-white/10 shadow-2xl">
            <button 
              onClick={() => setComparingListingId(null)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-white mb-1 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" /> Side-by-Side Version Snapshot Compare
            </h3>
            <p className="text-zinc-500 text-xs mb-6">Compare structural attribute shifts and rollbacks.</p>

            <div className="flex gap-4 mb-4">
              <div className="w-1/2">
                <label className="text-[10px] uppercase font-bold text-zinc-400">Snapshot A</label>
                <select 
                  value={selectedVersionA}
                  onChange={(e) => setSelectedVersionA(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-white/10 bg-zinc-900 text-white text-xs mt-1"
                >
                  {(versions[comparingListingId] || []).map(v => (
                    <option key={v.id} value={v.id}>Version #{v.versionNumber} ({v.changeSummary.substring(0, 30)}...)</option>
                  ))}
                </select>
              </div>
              <div className="w-1/2">
                <label className="text-[10px] uppercase font-bold text-zinc-400">Snapshot B</label>
                <select 
                  value={selectedVersionB}
                  onChange={(e) => setSelectedVersionB(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-white/10 bg-zinc-900 text-white text-xs mt-1"
                >
                  {(versions[comparingListingId] || []).map(v => (
                    <option key={v.id} value={v.id}>Version #{v.versionNumber} ({v.changeSummary.substring(0, 30)}...)</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Split diff viewer */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-4 border border-white/5 rounded-xl p-3 bg-white/[0.01] text-xs">
              {/* Snapshot A Details */}
              <div className="border-r border-white/5 pr-4 space-y-4 text-zinc-300">
                {(() => {
                  const ver = (versions[comparingListingId] || []).find(v => v.id === selectedVersionA);
                  if (!ver) return <p className="text-zinc-600">Select version to view details</p>;
                  const snap = ver.snapshotData;
                  return (
                    <>
                      <div>
                        <span className="font-bold text-indigo-400">Title:</span>
                        <p className="text-[11px] text-zinc-300 mt-1">{snap.title || ver.title}</p>
                      </div>
                      <div>
                        <span className="font-bold text-indigo-400">Price:</span>
                        <p className="font-mono mt-0.5">₹{snap.price}</p>
                      </div>
                      <div>
                        <span className="font-bold text-indigo-400">Bullet points:</span>
                        <ul className="list-disc pl-4 text-[10px] mt-1 space-y-1">
                          {((snap.bullet_points || ver.bulletPoints) as string[])?.map((bp, i) => (
                            <li key={i}>{bp}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="font-bold text-indigo-400">Keywords:</span>
                        <p className="font-mono text-[10px] mt-0.5 text-zinc-400">{((snap.backend_keywords || ver.keywords) as string[])?.join(", ")}</p>
                      </div>
                      <div>
                        <span className="font-bold text-indigo-400">Fulfillment Mode:</span>
                        <p className="mt-0.5">{snap.fulfillment_channel || "FBA"}</p>
                      </div>
                      <div>
                        <span className="font-bold text-indigo-400">Status:</span>
                        <p className="mt-0.5 uppercase">{snap.status || "active"}</p>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Snapshot B Details */}
              <div className="pl-2 space-y-4 text-zinc-300">
                {(() => {
                  const ver = (versions[comparingListingId] || []).find(v => v.id === selectedVersionB);
                  if (!ver) return <p className="text-zinc-600">Select version to view details</p>;
                  const snap = ver.snapshotData;
                  return (
                    <>
                      <div>
                        <span className="font-bold text-emerald-400">Title:</span>
                        <p className="text-[11px] text-zinc-300 mt-1">{snap.title || ver.title}</p>
                      </div>
                      <div>
                        <span className="font-bold text-emerald-400">Price:</span>
                        <p className="font-mono mt-0.5">₹{snap.price}</p>
                      </div>
                      <div>
                        <span className="font-bold text-emerald-400">Bullet points:</span>
                        <ul className="list-disc pl-4 text-[10px] mt-1 space-y-1">
                          {((snap.bullet_points || ver.bulletPoints) as string[])?.map((bp, i) => (
                            <li key={i}>{bp}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="font-bold text-emerald-400">Keywords:</span>
                        <p className="font-mono text-[10px] mt-0.5 text-zinc-400">{((snap.backend_keywords || ver.keywords) as string[])?.join(", ")}</p>
                      </div>
                      <div>
                        <span className="font-bold text-emerald-400">Fulfillment Mode:</span>
                        <p className="mt-0.5">{snap.fulfillment_channel || "FBA"}</p>
                      </div>
                      <div>
                        <span className="font-bold text-emerald-400">Status:</span>
                        <p className="mt-0.5 uppercase">{snap.status || "active"}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={() => setComparingListingId(null)}
                className="px-5 h-10 rounded-xl border border-white/10 hover:bg-white/5 text-zinc-300 font-bold text-xs"
              >
                Close Comparison
              </button>
              <button 
                onClick={() => {
                  handleRestoreVersion(comparingListingId, selectedVersionB);
                  setComparingListingId(null);
                }}
                className="px-5 h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs"
              >
                Restore Selected Snapshot B
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
