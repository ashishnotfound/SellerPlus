"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToastStore } from "@/hooks/use-toast-store";
import { GlassCard } from "@/components/glass-card";
import {
  generateKeywords,
  generateKeywordsFromAsin,
  KeywordResult,
} from "@/lib/ai";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/use-subscription";
import {
  Copy,
  CopyCheck,
  Cpu,
  Download,
  Loader2,
  Search,
  Sparkles,
  Lock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  Hash,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";

type KeywordTab = "all" | "primary" | "long-tail" | "backend" | "hidden-opportunity";
type SortKey = "opportunityScore" | "searchVolume" | "difficulty" | "bidMin";

export default function KeywordEnginePage() {
  // Existing state
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("Home & Kitchen");
  const [competitors, setCompetitors] = useState("");

  // NEW: Reverse ASIN mode
  const [reverseAsinMode, setReverseAsinMode] = useState(false);
  const [asinInput, setAsinInput] = useState("");

  // NEW: Cluster view toggle
  const [clusterView, setClusterView] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("opportunityScore");

  const [loading, setLoading] = useState(false);
  const [keywords, setKeywords] = useState<KeywordResult[] | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<KeywordTab>("all");
  const [copied, setCopied] = useState(false);

  const currentPlan = useSubscription((s) => s.currentPlan);
  const usageThisPeriod = useSubscription((s) => s.usageThisPeriod);
  const isFeatureGated = useSubscription((s) => s.isFeatureGated);
  const incrementUsage = useSubscription((s) => s.incrementUsage);

  const isLimitReached = usageThisPeriod.aiGenerations >= usageThisPeriod.maxGenerations;
  const isExportGated = isFeatureGated("csv-export");
  const isReverseAsinGated = isFeatureGated("competitor-analysis");

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLimitReached) return;
    setLoading(true);
    setKeywords(null);
    setError("");
    setActiveTab("all");

    try {
      let res: KeywordResult[];
      if (reverseAsinMode) {
        if (isReverseAsinGated) {
          setError("Reverse ASIN is a Pro/Business feature. Please upgrade.");
          setLoading(false);
          return;
        }
        res = await generateKeywordsFromAsin(asinInput.trim(), category);
      } else {
        res = await generateKeywords(productName, category, competitors);
      }
      setKeywords(res);
      incrementUsage("aiGenerations");
    } catch (e: any) {
      setError(e?.message || "Failed to generate keywords. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filteredKeywords = useMemo(() => {
    if (!keywords) return [];
    let list = activeTab === "all" ? keywords
      : activeTab === "primary" ? keywords.filter(k => k.type === "primary" || k.type === "secondary")
      : keywords.filter(k => k.type === activeTab);

    // Sort by selected key
    return [...list].sort((a, b) => {
      const aVal = (a as any)[sortKey] ?? 0;
      const bVal = (b as any)[sortKey] ?? 0;
      return sortKey === "difficulty" ? aVal - bVal : bVal - aVal;
    });
  }, [keywords, activeTab, sortKey]);

  // Cluster grouping
  const clusteredKeywords = useMemo(() => {
    if (!keywords) return {};
    const groups: Record<string, KeywordResult[]> = {};
    filteredKeywords.forEach(kw => {
      const cluster = kw.cluster || "General";
      if (!groups[cluster]) groups[cluster] = [];
      groups[cluster].push(kw);
    });
    return groups;
  }, [filteredKeywords, keywords]);

  const handleCopyAll = () => {
    if (!keywords) return;
    navigator.clipboard.writeText(keywords.map(k => k.keyword).join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCSV = () => {
    if (!keywords) return;
    const headers = "Keyword,Type,Cluster,Search Volume,Difficulty,Opportunity Score,Bid Min,Bid Max,Intent,Potential,Competitor Usage,Placement,Trend";
    const rows = keywords.map(k =>
      `"${k.keyword}","${k.type}","${k.cluster || ""}",${k.searchVolume},${k.difficulty},${k.opportunityScore ?? ""},${k.bidMin ?? ""},${k.bidMax ?? ""},"${k.intent}","${k.rankingPotential}","${k.competitorUsage || ""}","${k.suggestedPlacement || ""}","${k.trend || ""}"`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords_${(reverseAsinMode ? asinInput : productName).replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const categories = [
    "Home & Kitchen", "Health & Personal Care", "Sports & Fitness", "Automotive Parts",
    "Electronics", "Fashion", "Beauty & Cosmetics", "Toys & Games",
    "Books", "Office Products", "Pet Supplies", "Baby Products",
    "Grocery & Gourmet", "Tools & Hardware", "Garden & Outdoors", "Art & Collectibles",
  ];

  const tabConfig: { id: KeywordTab; label: string; count: number }[] = [
    { id: "all", label: "All", count: keywords?.length || 0 },
    { id: "primary", label: "High Volume", count: keywords?.filter(k => k.type === "primary" || k.type === "secondary").length || 0 },
    { id: "long-tail", label: "Long Tail", count: keywords?.filter(k => k.type === "long-tail").length || 0 },
    { id: "backend", label: "Backend", count: keywords?.filter(k => k.type === "backend").length || 0 },
    { id: "hidden-opportunity", label: "Hidden Gems", count: keywords?.filter(k => k.type === "hidden-opportunity").length || 0 },
  ];

  const getTypeColor = (type: string) => {
    switch (type) {
      case "primary": return "text-[#00c48c]";
      case "secondary": return "text-sky-400";
      case "long-tail": return "text-emerald-400";
      case "backend": return "text-amber-400";
      case "hidden-opportunity": return "text-pink-400";
      default: return "text-zinc-400";
    }
  };

  const getUsageColor = (usage: string) => {
    switch (usage) {
      case "untapped": return "bg-[#00c48c]/10 text-[#00c48c]";
      case "rare": return "bg-amber-500/10 text-amber-400";
      case "common": return "bg-zinc-500/10 text-zinc-400";
      default: return "bg-zinc-500/10 text-zinc-400";
    }
  };

  const TrendBadge = ({ trend }: { trend?: string }) => {
    if (!trend) return null;
    if (trend === "rising") return (
      <span className="flex items-center gap-0.5 text-[#00c48c] text-[9px] font-bold">
        <TrendingUp className="w-3 h-3" /> Rising
      </span>
    );
    if (trend === "declining") return (
      <span className="flex items-center gap-0.5 text-rose-400 text-[9px] font-bold">
        <TrendingDown className="w-3 h-3" /> Declining
      </span>
    );
    return (
      <span className="flex items-center gap-0.5 text-zinc-500 text-[9px] font-bold">
        <Minus className="w-3 h-3" /> Stable
      </span>
    );
  };

  const OpportunityBar = ({ score }: { score?: number }) => {
    if (score === undefined) return <span className="text-zinc-600 text-[10px]">—</span>;
    const color = score >= 70 ? "bg-[#00c48c]" : score >= 40 ? "bg-amber-400" : "bg-rose-400";
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-14 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
        </div>
        <span className="text-[10px] font-mono text-zinc-400">{score}</span>
      </div>
    );
  };

  const SortButton = ({ label, sk }: { label: string; sk: SortKey }) => (
    <button
      onClick={() => setSortKey(sk)}
      className={cn(
        "text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded border transition-all flex items-center gap-1",
        sortKey === sk
          ? "bg-[#00c48c]/10 text-[#00c48c] border-[#00c48c]/20"
          : "text-zinc-600 border-white/[0.05] hover:text-zinc-400"
      )}
    >
      <ArrowUpDown className="w-2.5 h-2.5" />
      {label}
    </button>
  );

  const KeywordTable = ({ list }: { list: KeywordResult[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/[0.06] text-zinc-600 font-semibold h-8">
            <th className="pr-3">Search Term</th>
            <th className="pr-3">Type</th>
            <th className="pr-3">Cluster</th>
            <th className="pr-3">Volume</th>
            <th className="pr-3">Difficulty</th>
            <th className="pr-3">Opportunity</th>
            <th className="pr-3">PPC Bid (₹)</th>
            <th className="pr-3">Intent</th>
            <th className="pr-3">Competition</th>
            <th className="pr-3">Placement</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {list.map((kw, idx) => (
            <tr key={idx} className="h-10 hover:bg-white/[0.02] transition-colors">
              <td className="font-semibold text-zinc-200 pr-3">{kw.keyword}</td>
              <td className="pr-3">
                <span className={`text-[9px] uppercase font-bold ${getTypeColor(kw.type)}`}>
                  {kw.type === "hidden-opportunity" ? "hidden" : kw.type}
                </span>
              </td>
              <td className="pr-3">
                <span className="text-[9px] font-mono text-zinc-500 bg-white/[0.03] px-1.5 py-0.5 rounded">
                  {kw.cluster || "—"}
                </span>
              </td>
              <td className="font-mono text-zinc-300 pr-3">{kw.searchVolume !== null && kw.searchVolume !== undefined ? kw.searchVolume.toLocaleString("en-IN") : "N/A"}</td>
              <td className="pr-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-10 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={`h-full ${kw.difficulty > 60 ? "bg-rose-500" : kw.difficulty > 30 ? "bg-amber-500" : "bg-[#00c48c]"}`}
                      style={{ width: `${kw.difficulty}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-zinc-500 font-mono">{kw.difficulty}%</span>
                </div>
              </td>
              <td className="pr-3"><OpportunityBar score={kw.opportunityScore} /></td>
              <td className="pr-3 text-zinc-400 font-mono text-[10px]">
                {kw.bidMin && kw.bidMax ? `₹${kw.bidMin}–${kw.bidMax}` : "—"}
              </td>
              <td className="capitalize text-zinc-500 pr-3">{kw.intent}</td>
              <td className="pr-3">
                {kw.competitorUsage && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${getUsageColor(kw.competitorUsage)}`}>
                    {kw.competitorUsage}
                  </span>
                )}
              </td>
              <td className="pr-3">
                {kw.suggestedPlacement && (
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-500 text-[9px] font-mono uppercase">
                    {kw.suggestedPlacement}
                  </span>
                )}
              </td>
              <td><TrendBadge trend={kw.trend} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Keyword Engine™</h1>
          <p className="text-zinc-500 text-sm mt-0.5">AI-powered keyword intelligence — volume, difficulty, PPC bids, opportunity scoring & more.</p>
        </div>
        {/* Mode toggle */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#161719] border border-white/[0.06]">
          <button
            onClick={() => setReverseAsinMode(false)}
            className={cn(
              "px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5",
              !reverseAsinMode ? "bg-[#00c48c] text-black" : "text-zinc-500 hover:text-zinc-200"
            )}
          >
            <Search className="w-3 h-3" /> Seed Keyword
          </button>
          <button
            onClick={() => setReverseAsinMode(true)}
            className={cn(
              "px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5",
              reverseAsinMode ? "bg-[#00c48c] text-black" : "text-zinc-500 hover:text-zinc-200",
              isReverseAsinGated && "opacity-60"
            )}
          >
            <Hash className="w-3 h-3" /> Reverse ASIN
            {isReverseAsinGated && <Lock className="w-2.5 h-2.5" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Input Panel */}
        <div className="flex flex-col gap-5">
          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <Cpu className="w-4 h-4 text-[#00c48c]" />
              <h3 className="text-sm font-bold text-white">
                {reverseAsinMode ? "Reverse ASIN Lookup" : "Keyword Intelligence"}
              </h3>
            </div>

            <form onSubmit={handleGenerate} className="flex flex-col gap-4">
              {reverseAsinMode ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Competitor ASIN</label>
                    <div className="relative">
                      <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="e.g. B0C123XYZ4"
                        value={asinInput}
                        onChange={(e) => setAsinInput(e.target.value.toUpperCase())}
                        className="w-full h-10 pl-9 pr-4 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all placeholder-zinc-600 font-mono"
                        required
                      />
                    </div>
                    <p className="text-[10px] text-zinc-600">Extracts keywords your competitor likely ranks for organically.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all"
                    >
                      {categories.map(cat => <option key={cat} value={cat} className="bg-[#0d0e10]">{cat}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Product / Seed Phrase</label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="e.g. Memory Foam Seat Cushion"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all placeholder-zinc-600"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all"
                    >
                      {categories.map(cat => <option key={cat} value={cat} className="bg-[#0d0e10]">{cat}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Competitor ASINs / Brands (optional)</label>
                    <textarea
                      placeholder="e.g. ASIN B0C123XYZ, brand SeatMax"
                      value={competitors}
                      onChange={(e) => setCompetitors(e.target.value)}
                      className="w-full min-h-[80px] p-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all placeholder-zinc-600"
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] flex items-start gap-2 text-xs text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              {isLimitReached && (
                <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.04] flex flex-col gap-1 text-xs text-rose-300">
                  <span className="font-bold flex items-center gap-1.5 text-rose-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> AI Generation Limit Reached
                  </span>
                  <p>Upgrade to Weekly, Pro, or Business to search more keywords.</p>
                  <a href="/billing" className="text-[#00c48c] font-bold text-[10px] mt-0.5">View Pricing →</a>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || isLimitReached}
                className="w-full h-10 rounded-lg bg-[#00c48c] hover:bg-[#00b07d] text-black font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-all mt-1"
              >
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting Keywords...</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> {reverseAsinMode ? "Extract ASIN Keywords" : "Generate Keyword Map"}</>
                )}
              </button>
            </form>
          </GlassCard>

          {/* Sort & View controls */}
          {keywords && (
            <GlassCard>
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-3">Sort & View</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <SortButton label="Opportunity" sk="opportunityScore" />
                <SortButton label="Volume" sk="searchVolume" />
                <SortButton label="Difficulty" sk="difficulty" />
                <SortButton label="Bid" sk="bidMin" />
              </div>
              <button
                onClick={() => setClusterView(!clusterView)}
                className={cn(
                  "w-full h-8 rounded-lg border text-[10px] font-bold transition-all flex items-center justify-center gap-1.5",
                  clusterView
                    ? "bg-[#00c48c]/10 border-[#00c48c]/20 text-[#00c48c]"
                    : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"
                )}
              >
                <BarChart2 className="w-3 h-3" />
                {clusterView ? "Cluster View ON" : "Switch to Cluster View"}
              </button>
            </GlassCard>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          {!keywords && !loading && (
            <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8 border-dashed border-white/[0.08]">
              <Search className="w-10 h-10 text-zinc-700 mb-3" />
              <h4 className="text-sm font-bold text-white mb-1">Keyword Output Grid</h4>
              <p className="text-xs text-zinc-600 max-w-[260px] leading-relaxed">
                {reverseAsinMode
                  ? "Enter a competitor ASIN to extract the keywords they rank for organically."
                  : "Provide a seed phrase and query the Keyword Engine to isolate optimization targets."}
              </p>
            </GlassCard>
          )}

          {loading && (
            <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8">
              <Loader2 className="w-7 h-7 text-[#00c48c] animate-spin mb-3" />
              <h4 className="text-sm font-bold text-white mb-1">
                {reverseAsinMode ? "Reverse-Engineering ASIN Profile" : "Analyzing Keyword Intelligence"}
              </h4>
              <p className="text-xs text-zinc-500 max-w-[260px] leading-relaxed">
                Calculating opportunity scores, PPC bids, semantic clusters, and trend signals…
              </p>
            </GlassCard>
          )}

          {keywords && (
            <GlassCard className="flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {reverseAsinMode ? `ASIN ${asinInput} — ` : ""}Identified Keywords ({keywords.length})
                  </h3>
                  <p className="text-[10px] text-zinc-600 font-semibold tracking-wider uppercase mt-0.5">
                    Sorted by {sortKey === "opportunityScore" ? "Opportunity Score" : sortKey === "bidMin" ? "PPC Bid" : sortKey}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyAll}
                    className="text-[10px] font-semibold text-[#00c48c] hover:text-[#00c48c]/80 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#00c48c]/20 bg-[#00c48c]/[0.04] transition-all"
                  >
                    {copied ? <CopyCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied!" : "Copy All"}
                  </button>
                  <button
                    onClick={isExportGated ? () => useToastStore.getState().warning("Premium Feature", "CSV Export is a premium feature. Upgrade to unlock.") : handleExportCSV}
                    className="text-[10px] font-semibold text-zinc-400 hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] transition-all"
                  >
                    {isExportGated ? <Lock className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.02] border border-white/[0.05] overflow-x-auto">
                {tabConfig.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all whitespace-nowrap",
                      activeTab === tab.id
                        ? "bg-[#00c48c]/15 text-[#00c48c] border border-[#00c48c]/25"
                        : "text-zinc-600 hover:text-zinc-300 border border-transparent"
                    )}
                  >
                    {tab.label}
                    <span className="text-[9px] font-mono opacity-60">{tab.count}</span>
                  </button>
                ))}
              </div>

              {/* Cluster View */}
              {clusterView ? (
                <div className="flex flex-col gap-5">
                  {Object.entries(clusteredKeywords).map(([cluster, kws]) => (
                    <div key={cluster}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold text-[#00c48c] uppercase tracking-wider">{cluster}</span>
                        <div className="flex-1 h-px bg-[#00c48c]/10" />
                        <span className="text-[9px] text-zinc-600">{kws.length} keywords</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {kws.map((kw, i) => (
                          <div key={i} className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:border-[#00c48c]/20 transition-all">
                            <span className="text-xs font-semibold text-zinc-200">{kw.keyword}</span>
                            <div className="flex items-center gap-2 text-[9px] text-zinc-600">
                              <span className="font-mono">{kw.searchVolume !== null && kw.searchVolume !== undefined ? kw.searchVolume.toLocaleString() : "N/A"}</span>
                              {kw.opportunityScore !== undefined && (
                                <span className={kw.opportunityScore >= 70 ? "text-[#00c48c]" : kw.opportunityScore >= 40 ? "text-amber-400" : "text-rose-400"}>
                                  ⚡{kw.opportunityScore}
                                </span>
                              )}
                              <TrendBadge trend={kw.trend} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <KeywordTable list={filteredKeywords} />
                  {filteredKeywords.length === 0 && (
                    <div className="py-10 text-center text-xs text-zinc-600">
                      No keywords found for this filter. Try another tab.
                    </div>
                  )}
                </>
              )}
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
