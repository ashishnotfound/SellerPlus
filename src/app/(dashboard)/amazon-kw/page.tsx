"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { GlassCard } from "@/components/glass-card";
import {
  deepResearchKeyword,
  getRelatedKeywords,
  analyzeAsinKeywords,
  clusterKeywordList,
  generateKwInsights,
  checkAsinKeywordRanks,
  KWResearchReport,
  RelatedKeyword,
  AsinKeywordProfile,
  KeywordCluster,
  KWInsight,
  KeywordRankResult,
} from "@/lib/ai";
import { cn } from "@/lib/utils";
import {
  Search, Zap, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
  Lightbulb, Target, BarChart2, Hash, Download, Star, StarOff, BookOpen,
  Layers, Copy, ChevronRight, Info, X, Plus, Loader2, RefreshCw,
  ArrowUpDown, Filter, Globe2, Cpu, Sparkles, Shield, Lock,
  ArrowUp, ArrowDown, Package, Flame, Clock, FolderOpen,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────
type KWTab = "research" | "related" | "competitor" | "clusters" | "lists" | "insights";
type RelatedFilterType = "all" | "related" | "long-tail" | "synonym" | "trending" | "ai-suggested" | "misspelling";
type SortField = "searchVolume" | "difficulty" | "cpc" | "opportunityScore";

const RECENT_STORAGE_KEY = "amazonkw_recent_searches";
const SAVED_LIST_KEY = "amazonkw_saved_list";

const CATEGORIES = [
  "Home & Kitchen", "Electronics", "Fashion", "Beauty & Personal Care",
  "Sports & Fitness", "Toys & Games", "Books", "Automotive", "Pet Supplies",
  "Health & Household", "Baby Products", "Tools & Hardware", "Garden & Outdoors",
  "Office Products", "Grocery & Gourmet", "Art & Collectibles", "Musical Instruments",
];

// ── Sparkline component ────────────────────────────────────────
function Sparkline({ values, color = "#00c48c", height = 40, width = 200 }: {
  values: number[]; color?: string; height?: number; width?: number;
}) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts.join(" ")} />
    </svg>
  );
}

// ── Score gauge ────────────────────────────────────────────────
function ScoreGauge({ score, label, size = 56 }: { score: number; label: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "#00c48c" : score >= 45 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-white">{score}</span>
      </div>
      <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider text-center">{label}</span>
    </div>
  );
}

// ── Metric card ────────────────────────────────────────────────
function MetricCard({ label, value, sub, color = "zinc", tooltip }: {
  label: string; value: string | number; sub?: string; color?: string; tooltip?: string;
}) {
  const [showTip, setShowTip] = useState(false);
  const colorMap: Record<string, string> = {
    green: "text-[#00c48c]", amber: "text-amber-400", rose: "text-rose-400",
    sky: "text-sky-400", violet: "text-violet-400", zinc: "text-zinc-200",
  };
  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all relative group">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">{label}</span>
        {tooltip && (
          <div className="relative">
            <button onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}
              className="text-zinc-700 hover:text-zinc-500 transition-colors">
              <Info className="w-2.5 h-2.5" />
            </button>
            {showTip && (
              <div className="absolute bottom-full left-0 mb-1.5 w-48 p-2 rounded-lg bg-[#1c1d1f] border border-white/10 text-[10px] text-zinc-400 leading-relaxed z-50 shadow-xl">
                {tooltip}
              </div>
            )}
          </div>
        )}
      </div>
      <span className={`text-lg font-black ${colorMap[color] || "text-zinc-200"}`}>{value}</span>
      {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
    </div>
  );
}

// ── Trend badge ────────────────────────────────────────────────
function TrendBadge({ trend }: { trend?: string }) {
  if (trend === "rising") return <span className="flex items-center gap-0.5 text-[#00c48c] text-[9px] font-bold"><TrendingUp className="w-2.5 h-2.5" />Rising</span>;
  if (trend === "declining") return <span className="flex items-center gap-0.5 text-rose-400 text-[9px] font-bold"><TrendingDown className="w-2.5 h-2.5" />Declining</span>;
  return <span className="flex items-center gap-0.5 text-zinc-600 text-[9px] font-bold"><Minus className="w-2.5 h-2.5" />Stable</span>;
}

// ── Competition pill ───────────────────────────────────────────
function CompetitionPill({ level }: { level?: string }) {
  const map: Record<string, string> = {
    low: "bg-[#00c48c]/10 text-[#00c48c] border-[#00c48c]/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    high: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    "very-high": "bg-rose-600/15 text-rose-300 border-rose-600/30",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border", map[level || "medium"] || map.medium)}>
      {level === "very-high" ? "Very High" : level}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function AmazonKWPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<KWTab>("research");
  const [category, setCategory] = useState("Home & Kitchen");
  const [marketplace, setMarketplace] = useState("Amazon India");
  const [showFilters, setShowFilters] = useState(false);

  // Search history
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Research state
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchData, setResearchData] = useState<KWResearchReport | null>(null);
  const [researchError, setResearchError] = useState("");

  // Related keywords state
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedKeywords, setRelatedKeywords] = useState<RelatedKeyword[] | null>(null);
  const [relatedFilter, setRelatedFilter] = useState<RelatedFilterType>("all");
  const [relatedSort, setRelatedSort] = useState<SortField>("opportunityScore");
  const [relatedSearch, setRelatedSearch] = useState("");
  const [volumeMin, setVolumeMin] = useState("");
  const [diffMax, setDiffMax] = useState("");

  // Competitor ASIN state
  const [asinInput, setAsinInput] = useState("");
  const [asinProductContext, setAsinProductContext] = useState("");
  const [asinLoading, setAsinLoading] = useState(false);
  const [asinData, setAsinData] = useState<AsinKeywordProfile | null>(null);
  const [asinError, setAsinError] = useState("");
  const [asinGapOnly, setAsinGapOnly] = useState(false);

  // New ASIN Rank Tracker states
  const [compMode, setCompMode] = useState<"extract" | "track">("extract");
  const [trackKeywordsInput, setTrackKeywordsInput] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");
  const [trackResults, setTrackResults] = useState<KeywordRankResult[] | null>(null);

  // Clusters state
  const [clusterKeywordsInput, setClusterKeywordsInput] = useState("");
  const [clusterContext, setClusterContext] = useState("");
  const [clusterLoading, setClusterLoading] = useState(false);
  const [clusters, setClusters] = useState<KeywordCluster[] | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  // My Lists state
  const [savedKeywords, setSavedKeywords] = useState<string[]>([]);
  const [listName, setListName] = useState("My Keyword List");
  const [newKwInput, setNewKwInput] = useState("");

  // Insights state
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insights, setInsights] = useState<KWInsight[] | null>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_STORAGE_KEY);
      if (raw) setRecentSearches(JSON.parse(raw));
      const rawList = localStorage.getItem(SAVED_LIST_KEY);
      if (rawList) setSavedKeywords(JSON.parse(rawList));
    } catch {}
  }, []);

  const saveRecent = useCallback((kw: string) => {
    setRecentSearches(prev => {
      const next = [kw, ...prev.filter(r => r !== kw)].slice(0, 8);
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const saveToList = useCallback((kw: string) => {
    setSavedKeywords(prev => {
      const next = prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw];
      localStorage.setItem(SAVED_LIST_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Main Search Handler ──
  const handleSearch = async () => {
    if (!query.trim()) return;
    setResearchLoading(true);
    setResearchError("");
    setResearchData(null);
    setRelatedKeywords(null);
    setInsights(null);
    setActiveTab("research");
    saveRecent(query.trim());

    const res = await deepResearchKeyword(query.trim(), marketplace);
    if (res.success && res.data) {
      setResearchData(res.data);
      // Auto-load related keywords in background
      loadRelated(query.trim());
    } else {
      setResearchError(res.error || "Research failed.");
    }
    setResearchLoading(false);
  };

  const loadRelated = async (kw: string) => {
    setRelatedLoading(true);
    try {
      let suggestions: string[] = [];
      try {
        const autoRes = await fetch(`/api/amazon/autocomplete?q=${encodeURIComponent(kw)}&marketplace=${encodeURIComponent(marketplace)}`);
        if (autoRes.ok) {
          const autoData = await autoRes.json();
          suggestions = autoData.suggestions || [];
        }
      } catch (err) {
        console.error("Autocomplete fetch failed, falling back to pure AI", err);
      }

      const data = await getRelatedKeywords(kw, category, marketplace, suggestions);
      setRelatedKeywords(data);
    } catch {}
    setRelatedLoading(false);
  };

  const fetchCatalogItemContext = async (asin: string) => {
    const clientId = typeof window !== "undefined" ? localStorage.getItem("sp_amazon_client_id") : null;
    const clientSecret = typeof window !== "undefined" ? localStorage.getItem("sp_amazon_client_secret") : null;
    const refreshToken = typeof window !== "undefined" ? localStorage.getItem("sp_amazon_refresh_token") : null;

    if (!clientId || !clientSecret || !refreshToken) {
      return "";
    }

    try {
      const catRes = await fetch("/api/amazon/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin: asin.toUpperCase(),
          clientId,
          clientSecret,
          refreshToken,
          region: marketplace
        })
      });
      if (catRes.ok) {
        const catData = await catRes.json();
        if (catData.success) {
          return `Title: ${catData.title}\nBrand: ${catData.brand}\nCategory: ${catData.category}\nDescription: ${catData.description}`;
        }
      }
    } catch (err) {
      console.error("SP-API Catalog fetch failed", err);
    }
    return "";
  };

  const handleAsinAnalysis = async () => {
    if (!asinInput.trim()) return;
    setAsinLoading(true);
    setAsinError("");
    setAsinData(null);

    const realContext = await fetchCatalogItemContext(asinInput.trim());
    if (realContext) {
      const titleLine = realContext.split("\n").find(line => line.startsWith("Title: ")) || "";
      if (titleLine) {
        setAsinProductContext(titleLine.replace("Title: ", "Real: "));
      }
    }

    const contextToUse = realContext || asinProductContext.trim();

    const res = await analyzeAsinKeywords(asinInput.trim().toUpperCase(), category, marketplace, contextToUse);
    if (res.success && res.data) setAsinData(res.data);
    else setAsinError(res.error || "ASIN analysis failed.");
    setAsinLoading(false);
  };

  const handleAsinTrack = async () => {
    if (!asinInput.trim() || !trackKeywordsInput.trim()) return;
    setTrackLoading(true);
    setTrackError("");
    setTrackResults(null);
    const kwList = trackKeywordsInput.split(/[,\n]+/).map(k => k.trim()).filter(Boolean);

    const realContext = await fetchCatalogItemContext(asinInput.trim());
    const contextToUse = realContext || asinProductContext.trim();

    const res = await checkAsinKeywordRanks(asinInput.trim().toUpperCase(), kwList, category, marketplace, contextToUse);
    if (res.success && res.data) {
      setTrackResults(res.data);
    } else {
      setTrackError(res.error || "Rank check failed.");
    }
    setTrackLoading(false);
  };

  const handleCluster = async () => {
    if (!clusterKeywordsInput.trim()) return;
    setClusterLoading(true);
    setClusters(null);
    const kwList = clusterKeywordsInput.split(/[,\n]+/).map(k => k.trim()).filter(Boolean);
    try {
      const data = await clusterKeywordList(kwList, clusterContext || "Amazon product");
      setClusters(data);
    } catch {}
    setClusterLoading(false);
  };

  const handleInsights = async () => {
    if (!researchData) return;
    setInsightsLoading(true);
    const data = await generateKwInsights(
      researchData.keyword,
      researchData,
      relatedKeywords?.length || 0,
      asinData ? 1 : 0
    );
    setInsights(data);
    setInsightsLoading(false);
  };

  // ── Filtered & sorted related keywords ──
  const filteredRelated = useMemo(() => {
    if (!relatedKeywords) return [];
    let list = relatedFilter === "all" ? relatedKeywords : relatedKeywords.filter(k => k.type === relatedFilter);
    if (relatedSearch) list = list.filter(k => k.keyword.toLowerCase().includes(relatedSearch.toLowerCase()));
    if (volumeMin) list = list.filter(k => k.searchVolume >= parseInt(volumeMin));
    if (diffMax) list = list.filter(k => k.difficulty <= parseInt(diffMax));
    return [...list].sort((a, b) => {
      const av = (a as any)[relatedSort] ?? 0;
      const bv = (b as any)[relatedSort] ?? 0;
      return relatedSort === "difficulty" ? av - bv : bv - av;
    });
  }, [relatedKeywords, relatedFilter, relatedSort, relatedSearch, volumeMin, diffMax]);

  // ── Cluster color map ──
  const clusterColorMap: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/[0.04] text-emerald-400",
    sky: "border-sky-500/30 bg-sky-500/[0.04] text-sky-400",
    amber: "border-amber-500/30 bg-amber-500/[0.04] text-amber-400",
    violet: "border-violet-500/30 bg-violet-500/[0.04] text-violet-400",
    pink: "border-pink-500/30 bg-pink-500/[0.04] text-pink-400",
    orange: "border-orange-500/30 bg-orange-500/[0.04] text-orange-400",
    teal: "border-teal-500/30 bg-teal-500/[0.04] text-teal-400",
    rose: "border-rose-500/30 bg-rose-500/[0.04] text-rose-400",
  };

  // ── Insight icons & colors ──
  const insightConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    opportunity: { icon: <Target className="w-4 h-4" />, color: "text-[#00c48c] bg-[#00c48c]/[0.08] border-[#00c48c]/20" },
    warning: { icon: <AlertTriangle className="w-4 h-4" />, color: "text-amber-400 bg-amber-400/[0.08] border-amber-400/20" },
    tip: { icon: <Lightbulb className="w-4 h-4" />, color: "text-sky-400 bg-sky-400/[0.08] border-sky-400/20" },
    competitor: { icon: <Shield className="w-4 h-4" />, color: "text-violet-400 bg-violet-400/[0.08] border-violet-400/20" },
    trend: { icon: <TrendingUp className="w-4 h-4" />, color: "text-pink-400 bg-pink-400/[0.08] border-pink-400/20" },
  };

  const exportCSV = () => {
    if (!relatedKeywords) return;
    const headers = "Keyword,Type,Volume,Difficulty,CPC (₹),Opportunity Score,Intent,Trend,Seasonality";
    const rows = filteredRelated.map(k =>
      `"${k.keyword}","${k.type}",${k.searchVolume},${k.difficulty},${k.cpc},${k.opportunityScore},"${k.intent}","${k.trend}","${k.seasonality}"`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `amazon_kw_${query.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const hasSearched = !!researchData || researchLoading;

  const tabs: { id: KWTab; label: string; icon: React.ReactNode }[] = [
    { id: "research", label: "Research", icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { id: "related", label: `Related${relatedKeywords ? ` (${relatedKeywords.length})` : ""}`, icon: <Layers className="w-3.5 h-3.5" /> },
    { id: "competitor", label: "Competitor ASIN", icon: <Hash className="w-3.5 h-3.5" /> },
    { id: "clusters", label: "Clusters", icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: "lists", label: `My Lists (${savedKeywords.length})`, icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: "insights", label: "AI Insights™", icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col gap-6 pb-10">

      {/* ── Hero Header ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#00c48c]/10 border border-[#00c48c]/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-[#00c48c]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Amazon KW™</h1>
            <p className="text-zinc-600 text-xs">AI-powered keyword intelligence — research, cluster, compete, and rank.</p>
          </div>
        </div>

        {/* ── Global Search Bar ── */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Search any Amazon keyword, product type, or niche…"
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-white/[0.08] bg-[#161719] text-white text-sm focus:outline-none focus:border-[#00c48c] transition-all placeholder-zinc-600 font-medium"
            />
          </div>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="h-12 px-3 rounded-xl border border-white/[0.08] bg-[#161719] text-zinc-400 text-xs focus:outline-none focus:border-[#00c48c] transition-all"
          >
            {CATEGORIES.map(c => <option key={c} value={c} className="bg-[#0d0e10]">{c}</option>)}
          </select>
          <select
            value={marketplace}
            onChange={e => setMarketplace(e.target.value)}
            className="h-12 px-3 rounded-xl border border-white/[0.08] bg-[#161719] text-zinc-400 text-xs focus:outline-none focus:border-[#00c48c] transition-all"
          >
            {["Amazon India", "Amazon US", "Amazon UK", "Amazon UAE", "Amazon Canada"].map(m => (
              <option key={m} value={m} className="bg-[#0d0e10]">{m}</option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || researchLoading}
            className="h-12 px-6 rounded-xl bg-[#00c48c] hover:bg-[#00b07d] text-black font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-all shrink-0"
          >
            {researchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Analyze
          </button>
        </div>

        {/* ── Recent searches (pre-search) ── */}
        {!hasSearched && recentSearches.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3" /> Recent:
            </span>
            {recentSearches.map(r => (
              <button key={r} onClick={() => { setQuery(r); }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-500 bg-white/[0.03] border border-white/[0.05] hover:text-[#00c48c] hover:border-[#00c48c]/20 transition-all">
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Pre-search Empty State ── */}
      {!hasSearched && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: <BarChart2 className="w-5 h-5 text-[#00c48c]" />, title: "16 Core Metrics", desc: "Volume, difficulty, CPC, buyer intent, conversion potential, seasonality, and more" },
            { icon: <Layers className="w-5 h-5 text-sky-400" />, title: "35+ Related Keywords", desc: "Long-tail, synonyms, misspellings, AI-suggested hidden opportunities" },
            { icon: <Hash className="w-5 h-5 text-violet-400" />, title: "Competitor ASIN Intel", desc: "Reverse-engineer any competitor's organic & sponsored keyword rankings" },
            { icon: <Cpu className="w-5 h-5 text-amber-400" />, title: "AI Keyword Clusters", desc: "Automatic semantic grouping with placement recommendations" },
            { icon: <Sparkles className="w-5 h-5 text-pink-400" />, title: "AI Insights™", desc: "Strategic recommendations explaining WHY each action matters" },
            { icon: <BookOpen className="w-5 h-5 text-teal-400" />, title: "Saved Lists & Export", desc: "Organize keywords into projects, export CSV, CSV, or PDF" },
          ].map((feat, i) => (
            <GlassCard key={i} className="flex flex-col gap-2 hover:border-white/10 transition-all">
              <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-1">
                {feat.icon}
              </div>
              <h4 className="text-sm font-bold text-white">{feat.title}</h4>
              <p className="text-xs text-zinc-600 leading-relaxed">{feat.desc}</p>
            </GlassCard>
          ))}
        </div>
      )}

      {/* ── Post-search: Tabs + Content ── */}
      {hasSearched && (
        <>
          {/* Tab Navigation */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#161719] border border-white/[0.06] overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all",
                  activeTab === tab.id ? "bg-[#00c48c] text-black" : "text-zinc-500 hover:text-zinc-200"
                )}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ════════════════════════════════════════════
              TAB 1 — RESEARCH
          ════════════════════════════════════════════ */}
          {activeTab === "research" && (
            <div className="flex flex-col gap-5">
              {researchLoading && (
                <GlassCard className="h-48 flex flex-col items-center justify-center text-center gap-3">
                  <Loader2 className="w-7 h-7 text-[#00c48c] animate-spin" />
                  <div>
                    <p className="text-sm font-bold text-white">Analyzing "{query}"</p>
                    <p className="text-xs text-zinc-600 mt-1">Running 16-metric keyword intelligence scan…</p>
                  </div>
                </GlassCard>
              )}
              {researchError && (
                <GlassCard className="p-4 border-rose-500/20 bg-rose-500/[0.04] flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-xs text-rose-300">{researchError}</span>
                </GlassCard>
              )}

              {researchData && (
                <>
                  {/* Keyword header */}
                  <GlassCard className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-black text-white">"{researchData.keyword}"</h2>
                        <CompetitionPill level={researchData.competitionLevel} />
                        <TrendBadge trend={researchData.trendDirection} />
                        {researchData.seasonalDemand === "peak" && (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full">
                            <Flame className="w-2.5 h-2.5" /> PEAK SEASON
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-600 text-xs mt-1">{researchData.marketplace} · {category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveToList(researchData.keyword)}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all",
                          savedKeywords.includes(researchData.keyword)
                            ? "bg-[#00c48c]/10 text-[#00c48c] border-[#00c48c]/20"
                            : "text-zinc-500 border-white/[0.06] hover:text-zinc-200"
                        )}>
                        {savedKeywords.includes(researchData.keyword) ? <Star className="w-3 h-3" /> : <StarOff className="w-3 h-3" />}
                        {savedKeywords.includes(researchData.keyword) ? "Saved" : "Save"}
                      </button>
                    </div>
                  </GlassCard>

                  {/* Score Gauges Row */}
                  <GlassCard>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-4">Core Score Overview</p>
                    <div className="flex items-center justify-around flex-wrap gap-4">
                      <ScoreGauge score={researchData.difficultyScore} label="Difficulty" size={64} />
                      <ScoreGauge score={researchData.opportunityScore} label="Opportunity" size={64} />
                      <ScoreGauge score={researchData.buyerIntentScore} label="Buyer Intent" size={64} />
                      <ScoreGauge score={researchData.clickThroughPotential} label="CTR Potential" size={64} />
                      <ScoreGauge score={researchData.conversionPotential} label="Conv. Potential" size={64} />
                      <ScoreGauge score={researchData.relevancyScore} label="Relevancy" size={64} />
                    </div>
                  </GlassCard>

                  {/* 16 Metric Cards Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard label="Monthly Volume" value={researchData.monthlySearchVolume.toLocaleString("en-IN")}
                      sub="searches/month" color="green"
                      tooltip="Estimated number of searches for this keyword on Amazon per month. Based on AI analysis of category traffic patterns." />
                    <MetricCard label="CPC Estimate" value={`₹${researchData.cpcEstimate.toFixed(2)}`}
                      sub="per click (PPC)" color="amber"
                      tooltip="Estimated cost per click if you run PPC ads for this keyword. Higher CPC = more competition from paid sellers." />
                    <MetricCard label="Revenue Opportunity" value={researchData.revenueOpportunity}
                      color="green"
                      tooltip="Estimated monthly revenue potential for a top-3 ranking listing targeting this keyword." />
                    <MetricCard label="Search Frequency Rank" value={`#${researchData.searchFrequencyRank.toLocaleString()}`}
                      sub="lower = more popular" color="sky"
                      tooltip="Amazon-style Search Frequency Rank. Lower numbers mean more popular searches. Similar to Amazon Brand Analytics SFR." />
                    <MetricCard label="Organic Competition" value={`${researchData.organicCompetition}/100`}
                      color={researchData.organicCompetition > 70 ? "rose" : researchData.organicCompetition > 40 ? "amber" : "green"}
                      tooltip="How many strong, established sellers already rank organically for this keyword. 0=nobody, 100=dominated by top brands." />
                    <MetricCard label="Sponsored Competition" value={`${researchData.sponsoredCompetition}/100`}
                      color={researchData.sponsoredCompetition > 70 ? "rose" : "amber"}
                      tooltip="Saturation of PPC ads for this keyword. High = expensive ads, you'll need bigger budgets to compete on sponsored placements." />
                    <MetricCard label="Ranking Potential" value={researchData.rankingPotential.toUpperCase()}
                      color={researchData.rankingPotential === "high" ? "green" : researchData.rankingPotential === "medium" ? "amber" : "rose"}
                      tooltip="AI assessment of how achievable it is for a new or growing seller to rank on page 1 for this keyword organically." />
                    <MetricCard label="Seasonal Demand" value={researchData.seasonalDemand.toUpperCase()}
                      color={researchData.seasonalDemand === "peak" ? "amber" : researchData.seasonalDemand === "high" ? "green" : "zinc"}
                      tooltip="How seasonal is this keyword? Peak = major spikes during festivals/seasons. Evergreen = consistent year-round demand." />
                  </div>

                  {/* Trend Sparkline Card */}
                  <GlassCard>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-bold text-white">12-Month Search Volume Trend</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">Relative demand across the calendar year · Peak months highlighted</p>
                      </div>
                      <div className="flex gap-2">
                        {researchData.peakMonths?.map(m => (
                          <span key={m} className="text-[9px] font-bold text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                    {researchData.searchVolumeTrend?.length >= 2 && (
                      <div className="flex flex-col gap-2">
                        <Sparkline values={researchData.searchVolumeTrend} width={600} height={80} color="#00c48c" />
                        <div className="flex justify-between text-[9px] text-zinc-700 font-mono">
                          {monthLabels.map(m => <span key={m}>{m}</span>)}
                        </div>
                      </div>
                    )}
                    {/* Volume range indicators */}
                    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.05]">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <div className="w-2 h-2 rounded-full bg-[#00c48c]" />
                        Peak: {Math.max(...(researchData.searchVolumeTrend || [100]))}% of max volume
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <div className="w-2 h-2 rounded-full bg-zinc-600" />
                        Low: {Math.min(...(researchData.searchVolumeTrend || [50]))}% of max volume
                      </div>
                    </div>
                  </GlassCard>

                  {/* AI Summary */}
                  <GlassCard className="border-[#00c48c]/15 bg-[#00c48c]/[0.02]">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-[#00c48c]/10 border border-[#00c48c]/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#00c48c]" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-[#00c48c] uppercase tracking-wider mb-1.5">AI Expert Assessment</p>
                        <p className="text-sm text-zinc-300 leading-relaxed">{researchData.aiSummary}</p>
                      </div>
                    </div>
                    {researchData.topRelatedKeywords?.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-[#00c48c]/10">
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2">Top Related Keywords to Also Target</p>
                        <div className="flex flex-wrap gap-1.5">
                          {researchData.topRelatedKeywords.map((kw, i) => (
                            <button key={i} onClick={() => saveToList(kw)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-400 bg-white/[0.03] border border-white/[0.05] hover:text-[#00c48c] hover:border-[#00c48c]/20 transition-all">
                              {kw}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </GlassCard>
                </>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════
              TAB 2 — RELATED KEYWORDS
          ════════════════════════════════════════════ */}
          {activeTab === "related" && (
            <div className="flex flex-col gap-4">
              {relatedLoading && !relatedKeywords && (
                <GlassCard className="h-40 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 text-[#00c48c] animate-spin" />
                  <p className="text-xs text-zinc-600">Generating 35+ related keywords…</p>
                </GlassCard>
              )}

              {relatedKeywords && (
                <>
                  {/* Controls */}
                  <GlassCard className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                      <input type="text" value={relatedSearch} onChange={e => setRelatedSearch(e.target.value)}
                        placeholder="Filter keywords…"
                        className="w-full h-8 pl-8 pr-3 rounded-lg border border-white/[0.06] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all placeholder-zinc-700"
                      />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {(["all", "related", "long-tail", "trending", "ai-suggested", "misspelling"] as RelatedFilterType[]).map(f => (
                        <button key={f} onClick={() => setRelatedFilter(f)}
                          className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border",
                            relatedFilter === f ? "bg-[#00c48c]/10 text-[#00c48c] border-[#00c48c]/20" : "text-zinc-600 border-white/[0.04] hover:text-zinc-300"
                          )}>
                          {f === "ai-suggested" ? "AI Gems" : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 ml-auto">
                      <button onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg border border-white/[0.05] transition-all">
                        <Filter className="w-3 h-3" /> Filters
                      </button>
                      <button onClick={exportCSV}
                        className="flex items-center gap-1 text-[10px] text-[#00c48c] hover:text-[#00c48c]/80 px-2.5 py-1.5 rounded-lg border border-[#00c48c]/20 bg-[#00c48c]/[0.04] transition-all">
                        <Download className="w-3 h-3" /> Export CSV
                      </button>
                    </div>
                  </GlassCard>

                  {showFilters && (
                    <GlassCard className="flex gap-4 flex-wrap items-end">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-zinc-600 uppercase">Min Volume</label>
                        <input type="number" value={volumeMin} onChange={e => setVolumeMin(e.target.value)}
                          placeholder="e.g. 500"
                          className="w-28 h-8 px-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-zinc-600 uppercase">Max Difficulty</label>
                        <input type="number" value={diffMax} onChange={e => setDiffMax(e.target.value)}
                          placeholder="e.g. 60"
                          className="w-28 h-8 px-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-zinc-600 uppercase">Sort By</label>
                        <select value={relatedSort} onChange={e => setRelatedSort(e.target.value as SortField)}
                          className="h-8 px-2.5 rounded-lg border border-white/[0.06] bg-[#161719] text-zinc-300 text-xs focus:outline-none focus:border-[#00c48c] transition-all">
                          <option value="opportunityScore">Opportunity</option>
                          <option value="searchVolume">Volume</option>
                          <option value="difficulty">Difficulty (Low→High)</option>
                          <option value="cpc">CPC</option>
                        </select>
                      </div>
                      <button onClick={() => { setVolumeMin(""); setDiffMax(""); }}
                        className="text-[10px] text-zinc-600 hover:text-zinc-300 pb-0.5">Clear</button>
                    </GlassCard>
                  )}

                  {/* Results count */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-600">
                      Showing <span className="text-zinc-300 font-bold">{filteredRelated.length}</span> of {relatedKeywords.length} keywords
                    </p>
                    <p className="text-[10px] text-zinc-700">Sorted by {relatedSort}</p>
                  </div>

                  {/* Keyword Table */}
                  <GlassCard className="overflow-x-auto p-0">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-zinc-600 font-bold h-9">
                          <th className="px-4">Keyword</th>
                          <th className="px-3">Type</th>
                          <th className="px-3">Volume</th>
                          <th className="px-3">Difficulty</th>
                          <th className="px-3">CPC (₹)</th>
                          <th className="px-3">Opportunity</th>
                          <th className="px-3">Intent</th>
                          <th className="px-3">Trend</th>
                          <th className="px-3">Seasonality</th>
                          <th className="px-3">Competition</th>
                          <th className="px-4">Save</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {filteredRelated.map((kw, i) => {
                          const typeColors: Record<string, string> = {
                            "related": "text-[#00c48c]", "long-tail": "text-sky-400",
                            "synonym": "text-amber-400", "broad": "text-zinc-400",
                            "phrase": "text-violet-400", "exact": "text-emerald-400",
                            "misspelling": "text-rose-400", "trending": "text-orange-400",
                            "ai-suggested": "text-pink-400",
                          };
                          const oColor = kw.opportunityScore >= 70 ? "text-[#00c48c]" : kw.opportunityScore >= 40 ? "text-amber-400" : "text-rose-400";
                          return (
                            <tr key={i} className="h-10 hover:bg-white/[0.02] transition-colors group">
                              <td className="px-4 font-semibold text-zinc-200">{kw.keyword}</td>
                              <td className="px-3">
                                <span className={`text-[9px] font-bold uppercase ${typeColors[kw.type] || "text-zinc-500"}`}>
                                  {kw.type === "ai-suggested" ? "AI Gem" : kw.type}
                                </span>
                              </td>
                              <td className="px-3 font-mono text-zinc-300">{kw.searchVolume.toLocaleString("en-IN")}</td>
                              <td className="px-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-10 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                                    <div className={`h-full ${kw.difficulty > 60 ? "bg-rose-500" : kw.difficulty > 35 ? "bg-amber-500" : "bg-[#00c48c]"}`}
                                      style={{ width: `${kw.difficulty}%` }} />
                                  </div>
                                  <span className="text-[9px] font-mono text-zinc-500">{kw.difficulty}</span>
                                </div>
                              </td>
                              <td className="px-3 font-mono text-zinc-400">₹{kw.cpc.toFixed(1)}</td>
                              <td className="px-3">
                                <span className={`text-[10px] font-bold ${oColor}`}>{kw.opportunityScore}</span>
                              </td>
                              <td className="px-3 text-zinc-500 capitalize text-[10px]">{kw.intent}</td>
                              <td className="px-3"><TrendBadge trend={kw.trend} /></td>
                              <td className="px-3">
                                <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                                  kw.seasonality === "evergreen" ? "text-[#00c48c] bg-[#00c48c]/10" :
                                  kw.seasonality === "holiday" ? "text-orange-400 bg-orange-400/10" :
                                  "text-amber-400 bg-amber-400/10"
                                )}>
                                  {kw.seasonality}
                                </span>
                              </td>
                              <td className="px-3">
                                <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                                  kw.competitorUsage === "untapped" ? "text-[#00c48c] bg-[#00c48c]/10" :
                                  kw.competitorUsage === "rare" ? "text-amber-400 bg-amber-400/10" :
                                  "text-zinc-500 bg-zinc-500/10"
                                )}>
                                  {kw.competitorUsage}
                                </span>
                              </td>
                              <td className="px-4">
                                <button onClick={() => saveToList(kw.keyword)}
                                  className={cn("transition-colors", savedKeywords.includes(kw.keyword) ? "text-[#00c48c]" : "text-zinc-700 hover:text-zinc-400")}>
                                  <Star className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredRelated.length === 0 && (
                      <div className="py-12 text-center text-xs text-zinc-600">No keywords match your filters.</div>
                    )}
                  </GlassCard>
                </>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════
              TAB 3 — COMPETITOR ASIN
          ════════════════════════════════════════════ */}
          {activeTab === "competitor" && (
            <div className="flex flex-col gap-4">
              {/* Sub-mode selector */}
              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#161719] border border-white/[0.06] w-fit">
                <button
                  onClick={() => setCompMode("extract")}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                    compMode === "extract" ? "bg-violet-500 text-white" : "text-zinc-500 hover:text-zinc-200"
                  )}
                >
                  Reverse ASIN Keywords
                </button>
                <button
                  onClick={() => setCompMode("track")}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                    compMode === "track" ? "bg-violet-500 text-white" : "text-zinc-500 hover:text-zinc-200"
                  )}
                >
                  ASIN Keyword Rank Tracker
                </button>
              </div>

              {compMode === "extract" ? (
                <>
                  <GlassCard>
                    <div className="flex items-center gap-2 mb-4">
                      <Hash className="w-4 h-4 text-violet-400" />
                      <h3 className="text-sm font-bold text-white">Competitor ASIN Keyword Extractor</h3>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                          <input
                            type="text"
                            value={asinInput}
                            onChange={e => setAsinInput(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === "Enter" && handleAsinAnalysis()}
                            placeholder="Enter competitor ASIN (e.g. B0C123XYZ4)"
                            className="w-full h-10 pl-9 pr-4 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-sm font-mono focus:outline-none focus:border-violet-500 transition-all placeholder-zinc-600"
                          />
                        </div>
                        <button onClick={handleAsinAnalysis} disabled={!asinInput.trim() || asinLoading}
                          className="h-10 px-5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50 transition-all shrink-0">
                          {asinLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hash className="w-3.5 h-3.5" />}
                          Extract Keywords
                        </button>
                      </div>
                      <div className="relative w-full">
                        <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                        <input
                          type="text"
                          value={asinProductContext}
                          onChange={e => setAsinProductContext(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleAsinAnalysis()}
                          placeholder="What is this product? (e.g. 'Miku Anime Poster', 'Garlic Press')"
                          className="w-full h-10 pl-9 pr-4 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-sm font-mono focus:outline-none focus:border-violet-500 transition-all placeholder-zinc-600"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-700 mt-2">Providing what the product is helps the AI accurately reverse-engineer keywords instead of guessing.</p>
                  </GlassCard>

                  {asinError && (
                    <GlassCard className="border-rose-500/20 bg-rose-500/[0.03]">
                      <p className="text-xs text-rose-400">{asinError}</p>
                    </GlassCard>
                  )}

                  {asinLoading && (
                    <GlassCard className="h-40 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                      <p className="text-xs text-zinc-600">Reverse-engineering ASIN keyword profile…</p>
                    </GlassCard>
                  )}

                  {asinData && (
                    <>
                      {/* ASIN summary cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <MetricCard label="Estimated Product" value={asinData.estimatedProduct} color="violet" />
                        <MetricCard label="Total Monthly Traffic" value={asinData.totalEstimatedTraffic.toLocaleString("en-IN")} sub="visits/month" color="sky" />
                        <MetricCard label="Organic Keywords" value={asinData.organicCount} color="green" />
                        <MetricCard label="Competitive Strength" value={asinData.competitiveStrength.toUpperCase()}
                          color={asinData.competitiveStrength === "dominant" || asinData.competitiveStrength === "strong" ? "rose" : "amber"} />
                      </div>

                      {/* Gap opportunities */}
                      {asinData.gapOpportunities?.length > 0 && (
                        <GlassCard className="border-[#00c48c]/15 bg-[#00c48c]/[0.02]">
                          <p className="text-[10px] font-bold text-[#00c48c] uppercase tracking-wider mb-3">
                            🎯 Your Gap Opportunities — Keywords competitor ranks for that you can target
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {asinData.gapOpportunities.map((kw, i) => (
                              <button key={i} onClick={() => saveToList(kw)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#00c48c] bg-[#00c48c]/[0.06] border border-[#00c48c]/20 hover:bg-[#00c48c]/10 transition-all">
                                {kw} <Plus className="w-2.5 h-2.5 inline ml-1" />
                              </button>
                            ))}
                          </div>
                        </GlassCard>
                      )}

                      {/* Keyword table */}
                      <GlassCard className="p-0">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                          <h3 className="text-sm font-bold text-white">Keyword Rankings — {asinData.asin}</h3>
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 cursor-pointer">
                            <input type="checkbox" checked={asinGapOnly} onChange={e => setAsinGapOnly(e.target.checked)} className="accent-[#00c48c]" />
                            Gap Only
                          </label>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-white/[0.06] text-zinc-600 font-bold h-9">
                                <th className="px-4">Keyword</th>
                                <th className="px-3">Rank</th>
                                <th className="px-3">Traffic Share</th>
                                <th className="px-3">Volume</th>
                                <th className="px-3">KW Value</th>
                                <th className="px-3">Type</th>
                                <th className="px-3">Difficulty</th>
                                <th className="px-3">Gap?</th>
                                <th className="px-4">Save</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                              {(asinGapOnly ? asinData.keywords.filter(k => k.isGap) : asinData.keywords).map((kw, i) => (
                                <tr key={i} className={cn("h-10 transition-colors",
                                  kw.isGap ? "bg-[#00c48c]/[0.02] hover:bg-[#00c48c]/[0.04]" : "hover:bg-white/[0.02]"
                                )}>
                                  <td className="px-4 font-semibold text-zinc-200">{kw.keyword}</td>
                                  <td className="px-3 font-mono text-zinc-300">#{kw.estimatedRank}</td>
                                  <td className="px-3">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-14 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                                        <div className="h-full bg-violet-400" style={{ width: `${Math.min(kw.trafficShare, 100)}%` }} />
                                      </div>
                                      <span className="text-[9px] font-mono text-zinc-500">{kw.trafficShare.toFixed(1)}%</span>
                                    </div>
                                  </td>
                                  <td className="px-3 font-mono text-zinc-400">{kw.searchVolume.toLocaleString("en-IN")}</td>
                                  <td className="px-3 text-[#00c48c] font-mono text-[10px]">{kw.keywordValue}</td>
                                  <td className="px-3">
                                    <div className="flex gap-1">
                                      {kw.isOrganic && <span className="text-[8px] font-bold text-[#00c48c] bg-[#00c48c]/10 px-1.5 py-0.5 rounded">ORG</span>}
                                      {kw.isSponsored && <span className="text-[8px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">ADS</span>}
                                    </div>
                                  </td>
                                  <td className="px-3">
                                    <div className="flex items-center gap-1">
                                      <div className="w-8 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                                        <div className={`h-full ${kw.difficulty > 60 ? "bg-rose-500" : kw.difficulty > 35 ? "bg-amber-500" : "bg-[#00c48c]"}`}
                                          style={{ width: `${kw.difficulty}%` }} />
                                      </div>
                                      <span className="text-[9px] text-zinc-600">{kw.difficulty}</span>
                                    </div>
                                  </td>
                                  <td className="px-3">
                                    {kw.isGap && <span className="text-[9px] font-bold text-[#00c48c] bg-[#00c48c]/10 px-1.5 py-0.5 rounded">YOU CAN WIN</span>}
                                  </td>
                                  <td className="px-4">
                                    <button onClick={() => saveToList(kw.keyword)}
                                      className={cn("transition-colors", savedKeywords.includes(kw.keyword) ? "text-[#00c48c]" : "text-zinc-700 hover:text-zinc-400")}>
                                      <Star className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </GlassCard>

                      {/* AI summary */}
                      <GlassCard className="border-violet-500/15 bg-violet-500/[0.02]">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1.5">Competitive Intelligence Summary</p>
                            <p className="text-xs text-zinc-300 leading-relaxed">{asinData.aiSummary}</p>
                          </div>
                        </div>
                      </GlassCard>
                    </>
                  )}
                </>
              ) : (
                <>
                  <GlassCard>
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-4 h-4 text-violet-400" />
                      <h3 className="text-sm font-bold text-white">ASIN Keyword Rank Tracker</h3>
                    </div>
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-4">
                        <div className="flex-1 flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Target ASIN</label>
                          <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                            <input
                              type="text"
                              value={asinInput}
                              onChange={e => setAsinInput(e.target.value.toUpperCase())}
                              placeholder="Enter target ASIN (e.g. B0C123XYZ4)"
                              className="w-full h-10 pl-9 pr-4 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs font-mono focus:outline-none focus:border-violet-500 transition-all placeholder-zinc-600"
                            />
                          </div>
                        </div>
                        <div className="w-48 flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Category</label>
                          <select
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            className="h-10 px-3 rounded-lg border border-white/[0.08] bg-[#161719] text-zinc-300 text-xs focus:outline-none focus:border-[#00c48c] transition-all"
                          >
                            {CATEGORIES.map(c => <option key={c} value={c} className="bg-[#0d0e10]">{c}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Keywords to Track (comma or newline separated)</label>
                        <textarea
                          value={trackKeywordsInput}
                          onChange={e => setTrackKeywordsInput(e.target.value)}
                          placeholder="e.g. noise cancelling headphones, wireless earbuds, bluetooth headset"
                          className="w-full min-h-[100px] p-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-violet-500 transition-all placeholder-zinc-700 font-mono"
                        />
                      </div>

                      <button onClick={handleAsinTrack} disabled={!asinInput.trim() || !trackKeywordsInput.trim() || trackLoading}
                        className="w-full h-10 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                        {trackLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking Keyword Ranks...</> : <><Search className="w-3.5 h-3.5" /> Check Keyword Ranks</>}
                      </button>
                    </div>
                  </GlassCard>

                  {trackError && (
                    <GlassCard className="border-rose-500/20 bg-rose-500/[0.03]">
                      <p className="text-xs text-rose-400">{trackError}</p>
                    </GlassCard>
                  )}

                  {trackLoading && (
                    <GlassCard className="h-40 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                      <p className="text-xs text-zinc-600">Querying keyword rankings for ASIN {asinInput}…</p>
                    </GlassCard>
                  )}

                  {trackResults && (
                    <GlassCard className="p-0">
                      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">Keyword Rank Tracker Results — {asinInput}</h3>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">{category}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-white/[0.06] text-zinc-600 font-bold h-9">
                              <th className="px-4">Keyword</th>
                              <th className="px-3">Organic Rank</th>
                              <th className="px-3">Sponsored Rank</th>
                              <th className="px-3">Search Volume</th>
                              <th className="px-3">Difficulty</th>
                              <th className="px-3">Ranking Status</th>
                              <th className="px-4">Strategic Action / Recommendation</th>
                              <th className="px-4">Save</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {trackResults.map((res, i) => {
                              const statusColor = res.rankingStatus === "dominant" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                                res.rankingStatus === "page-1" ? "text-[#00c48c] bg-[#00c48c]/10 border-[#00c48c]/20" :
                                res.rankingStatus === "page-2" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                                "text-rose-400 bg-rose-500/10 border-rose-500/20";
                              return (
                                <tr key={i} className="h-11 hover:bg-white/[0.02] transition-colors">
                                  <td className="px-4 font-semibold text-zinc-200">{res.keyword}</td>
                                  <td className="px-3 font-mono font-bold text-zinc-300">
                                    {res.organicRank === 1 ? "🏆 #1" : `#${res.organicRank}`}
                                  </td>
                                  <td className="px-3 font-mono text-zinc-500">
                                    {res.sponsoredRank === "none" ? "None" : `Ad #${res.sponsoredRank}`}
                                  </td>
                                  <td className="px-3 font-mono text-zinc-400">{res.searchVolume.toLocaleString()}</td>
                                  <td className="px-3">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-8 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                                        <div className={`h-full ${res.difficulty > 60 ? "bg-rose-500" : res.difficulty > 35 ? "bg-amber-500" : "bg-[#00c48c]"}`}
                                          style={{ width: `${res.difficulty}%` }} />
                                      </div>
                                      <span className="text-[9px] text-zinc-600">{res.difficulty}%</span>
                                    </div>
                                  </td>
                                  <td className="px-3">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${statusColor}`}>
                                      {res.rankingStatus.replace("-", " ")}
                                    </span>
                                  </td>
                                  <td className="px-4 text-zinc-400 text-xs leading-relaxed max-w-[280px]">
                                    {res.recommendation}
                                  </td>
                                  <td className="px-4">
                                    <button onClick={() => saveToList(res.keyword)}
                                      className={cn("transition-colors", savedKeywords.includes(res.keyword) ? "text-[#00c48c]" : "text-zinc-700 hover:text-zinc-400")}>
                                      <Star className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </GlassCard>
                  )}
                </>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════
              TAB 4 — CLUSTERS
          ════════════════════════════════════════════ */}
          {activeTab === "clusters" && (
            <div className="flex flex-col gap-4">
              <GlassCard>
                <div className="flex items-center gap-2 mb-4">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">AI Keyword Clustering Engine</h3>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-600 uppercase">Keywords to Cluster (comma or newline separated)</label>
                    <textarea
                      value={clusterKeywordsInput}
                      onChange={e => setClusterKeywordsInput(e.target.value)}
                      placeholder={researchData ? `${researchData.keyword}, ${(researchData.topRelatedKeywords || []).join(", ")}\n${(relatedKeywords || []).slice(0, 10).map(k => k.keyword).join(", ")}` : "Paste your keywords here, one per line or comma-separated…"}
                      className="w-full min-h-[100px] p-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-amber-500 transition-all placeholder-zinc-700 font-mono"
                    />
                  </div>
                  {researchData && relatedKeywords && (
                    <button onClick={() => {
                      const all = [researchData.keyword, ...researchData.topRelatedKeywords, ...relatedKeywords.slice(0, 20).map(k => k.keyword)];
                      setClusterKeywordsInput(all.join(", "));
                      setClusterContext(researchData.keyword);
                    }} className="text-[10px] text-amber-400 hover:text-amber-300 text-left font-bold transition-colors">
                      + Auto-fill from current research ({(1 + researchData.topRelatedKeywords.length + Math.min(20, relatedKeywords.length))} keywords)
                    </button>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-600 uppercase">Product Context (optional)</label>
                    <input type="text" value={clusterContext} onChange={e => setClusterContext(e.target.value)}
                      placeholder="e.g. memory foam seat cushion for office chair"
                      className="w-full h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-amber-500 transition-all placeholder-zinc-700" />
                  </div>
                  <button onClick={handleCluster} disabled={!clusterKeywordsInput.trim() || clusterLoading}
                    className="w-full h-10 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                    {clusterLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Clustering…</> : <><Cpu className="w-3.5 h-3.5" />Generate Clusters</>}
                  </button>
                </div>
              </GlassCard>

              {clusters && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {clusters.map(cluster => {
                    const cc = clusterColorMap[cluster.color] || clusterColorMap.emerald;
                    const isExpanded = expandedCluster === cluster.id;
                    return (
                      <GlassCard key={cluster.id} className={cn("border transition-all", cc.split(" ")[0])}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={cn("text-[10px] font-bold uppercase tracking-wider", cc.split(" ")[2])}>{cluster.type}</span>
                              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                                cluster.opportunityLevel === "high" ? "bg-[#00c48c]/10 text-[#00c48c]" :
                                cluster.opportunityLevel === "medium" ? "bg-amber-400/10 text-amber-400" :
                                "bg-zinc-600/10 text-zinc-400"
                              )}>
                                {cluster.opportunityLevel} opportunity
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-white mt-0.5">{cluster.name}</h4>
                          </div>
                          <button onClick={() => setExpandedCluster(isExpanded ? null : cluster.id)}
                            className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0">
                            {isExpanded ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {cluster.keywords.slice(0, isExpanded ? 999 : 6).map((kw, i) => (
                            <span key={i} className={cn("px-2 py-0.5 rounded text-[10px] font-medium border", cc.split(" ")[0], cc.split(" ")[1])}>
                              {kw}
                            </span>
                          ))}
                          {!isExpanded && cluster.keywords.length > 6 && (
                            <span className="text-[10px] text-zinc-600 self-center">+{cluster.keywords.length - 6} more</span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[10px] text-zinc-600 border-t border-white/[0.05] pt-2.5 mb-2.5">
                          <span>Avg Volume: <span className="text-zinc-400 font-mono">{cluster.avgVolume.toLocaleString()}</span></span>
                          <span>Avg Difficulty: <span className={cn("font-mono", cluster.avgDifficulty > 60 ? "text-rose-400" : cluster.avgDifficulty > 35 ? "text-amber-400" : "text-[#00c48c]")}>{cluster.avgDifficulty}/100</span></span>
                        </div>

                        {/* Placement badges */}
                        <div className="flex flex-wrap gap-1 mb-2.5">
                          {cluster.recommendedPlacement.map(p => (
                            <span key={p} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-500 uppercase">
                              {p}
                            </span>
                          ))}
                        </div>

                        {isExpanded && (
                          <div className={cn("mt-2 pt-2.5 border-t border-white/[0.05] text-xs leading-relaxed", cc.split(" ")[2] + "/70")}>
                            <p className="text-[10px] font-bold text-zinc-600 uppercase mb-1">AI Explanation</p>
                            <p className="text-zinc-400">{cluster.aiExplanation}</p>
                          </div>
                        )}
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════
              TAB 5 — MY LISTS
          ════════════════════════════════════════════ */}
          {activeTab === "lists" && (
            <div className="flex flex-col gap-4">
              <GlassCard>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-teal-400" />
                    <h3 className="text-sm font-bold text-white">My Keyword List</h3>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {
                      const text = savedKeywords.join(", ");
                      navigator.clipboard.writeText(text);
                    }} className="text-[10px] text-zinc-500 hover:text-zinc-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/[0.06] transition-all">
                      <Copy className="w-3 h-3" /> Copy All
                    </button>
                    <button onClick={() => {
                      if (savedKeywords.length === 0) return;
                      const csv = "Keyword\n" + savedKeywords.join("\n");
                      const blob = new Blob([csv], { type: "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${listName.replace(/\s+/g, "_")}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }} className="text-[10px] text-[#00c48c] hover:text-[#00c48c]/80 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#00c48c]/20 bg-[#00c48c]/[0.04] transition-all">
                      <Download className="w-3 h-3" /> Export CSV
                    </button>
                  </div>
                </div>

                {/* Add keyword manually */}
                <div className="flex gap-2 mb-4">
                  <input type="text" value={newKwInput} onChange={e => setNewKwInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newKwInput.trim()) { saveToList(newKwInput.trim()); setNewKwInput(""); } }}
                    placeholder="Add a keyword manually…"
                    className="flex-1 h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all placeholder-zinc-700" />
                  <button onClick={() => { if (newKwInput.trim()) { saveToList(newKwInput.trim()); setNewKwInput(""); } }}
                    className="h-9 px-4 rounded-lg bg-[#00c48c] hover:bg-[#00b07d] text-black font-bold text-xs transition-all">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {savedKeywords.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-700 border border-dashed border-white/[0.06] rounded-xl">
                    <Star className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
                    No keywords saved yet. Star keywords from Research, Related, or Competitor tabs to save them here.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {savedKeywords.map((kw, i) => (
                      <div key={i} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#00c48c]/[0.05] border border-[#00c48c]/15 text-xs font-medium text-zinc-300">
                        <span>{kw}</span>
                        <button onClick={() => saveToList(kw)} className="text-zinc-600 hover:text-rose-400 transition-colors ml-1">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {savedKeywords.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-between text-[10px] text-zinc-700">
                    <span>{savedKeywords.length} keywords saved</span>
                    <button onClick={() => { setSavedKeywords([]); localStorage.removeItem(SAVED_LIST_KEY); }}
                      className="text-rose-500/60 hover:text-rose-400 transition-colors">
                      Clear all
                    </button>
                  </div>
                )}
              </GlassCard>

              {/* Cluster this list */}
              {savedKeywords.length >= 3 && (
                <GlassCard className="border-amber-500/15 bg-amber-500/[0.02]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-amber-400">Cluster Your Saved Keywords</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">Run AI clustering on your {savedKeywords.length} saved keywords to get a complete strategy.</p>
                    </div>
                    <button onClick={() => {
                      setClusterKeywordsInput(savedKeywords.join(", "));
                      setClusterContext(researchData?.keyword || "Amazon product");
                      setActiveTab("clusters");
                    }} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-all shrink-0">
                      <Cpu className="w-3 h-3" /> Cluster Now
                    </button>
                  </div>
                </GlassCard>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════
              TAB 6 — AI INSIGHTS™
          ════════════════════════════════════════════ */}
          {activeTab === "insights" && (
            <div className="flex flex-col gap-4">
              {!insights && !insightsLoading && (
                <GlassCard className="flex flex-col items-center justify-center text-center gap-4 py-12">
                  <div className="w-12 h-12 rounded-xl bg-[#00c48c]/10 border border-[#00c48c]/20 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-[#00c48c]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">AI Insights™</h4>
                    <p className="text-xs text-zinc-600 max-w-xs leading-relaxed">
                      Generate expert strategic recommendations for "{query}" — with reasoning for every suggestion.
                    </p>
                  </div>
                  <button onClick={handleInsights} disabled={!researchData}
                    className="px-6 py-2.5 rounded-xl bg-[#00c48c] hover:bg-[#00b07d] text-black font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-40">
                    <Sparkles className="w-4 h-4" /> Generate AI Insights™
                  </button>
                  {!researchData && (
                    <p className="text-[10px] text-zinc-700">Run a keyword search first to generate insights.</p>
                  )}
                </GlassCard>
              )}

              {insightsLoading && (
                <GlassCard className="h-40 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 text-[#00c48c] animate-spin" />
                  <p className="text-xs text-zinc-600">Generating expert AI insights…</p>
                </GlassCard>
              )}

              {insights && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-600">{insights.length} strategic insights generated for "<span className="text-zinc-300">{query}</span>"</p>
                    <button onClick={handleInsights} disabled={insightsLoading}
                      className="text-[10px] text-zinc-500 hover:text-zinc-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/[0.06] transition-all">
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {insights.map(insight => {
                      const cfg = insightConfig[insight.type] || insightConfig.tip;
                      const impactColor = insight.impact === "high" ? "text-[#00c48c]" : insight.impact === "medium" ? "text-amber-400" : "text-zinc-500";
                      return (
                        <GlassCard key={insight.id} className={cn("flex flex-col gap-3 border", cfg.color.split(" ").slice(1).join(" "))}>
                          <div className="flex items-start gap-3">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border", cfg.color)}>
                              {cfg.icon}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className={cn("text-[9px] font-bold uppercase tracking-wider", cfg.color.split(" ")[0])}>
                                  {insight.type}
                                </span>
                                <span className={cn("text-[9px] font-bold uppercase", impactColor)}>
                                  {insight.impact} impact
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-white mt-1">{insight.headline}</h4>
                            </div>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">{insight.detail}</p>
                          <div className="pt-2.5 border-t border-white/[0.05]">
                            <p className="text-[10px] font-bold text-zinc-600 uppercase mb-1">Action</p>
                            <p className="text-xs text-zinc-300 font-medium">{insight.action}</p>
                          </div>
                          {insight.relatedKeywords && insight.relatedKeywords.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {insight.relatedKeywords.map((kw, i) => (
                                <span key={i} className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-500">{kw}</span>
                              ))}
                            </div>
                          )}
                        </GlassCard>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
