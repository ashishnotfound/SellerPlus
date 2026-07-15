"use client";

import React, { useState, useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import {
  optimizeCopy,
  generateFullListing,
  generateCopyVariations,
  rewriteWithCompetitorGap,
  CopySection,
  CopyMarketplace,
  CopyTone,
  FullListingResult,
  CopyVariation,
} from "@/lib/ai";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/use-subscription";
import {
  BookOpen,
  Check,
  Copy,
  CopyCheck,
  FileText,
  Globe2,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquare,
  Mic2,
  Search,
  Sparkles,
  Tag,
  Type,
  Wand2,
  Zap,
  Lock,
  AlertTriangle,
  Languages,
  BarChart2,
  Swords,
  Shuffle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// Section char limits for live counter
const SECTION_LIMITS: Record<string, number> = {
  title: 200,
  bullets: 500,
  description: 2000,
  "brand-story": 2000,
  "a-plus-content": 5000,
  faq: 3000,
  "search-terms": 500,
};

type OutputMode = "optimize" | "variations" | "competitor-gap";
type Language = "English" | "Hinglish" | "Hindi" | "Tamil" | "Bengali";

export default function CopywriterPage() {
  const [currentText, setCurrentText] = useState("");
  const [section, setSection] = useState<CopySection>("title");
  const [marketplace, setMarketplace] = useState<CopyMarketplace>("amazon");
  const [tone, setTone] = useState<CopyTone>("professional");
  const [instructions, setInstructions] = useState("");
  const [language, setLanguage] = useState<Language>("English");

  const [outputMode, setOutputMode] = useState<OutputMode>("optimize");

  // Optimize mode
  const [loading, setLoading] = useState(false);
  const [optimizedText, setOptimizedText] = useState("");
  const [copied, setCopied] = useState(false);

  // Variations mode
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [variations, setVariations] = useState<CopyVariation[] | null>(null);
  const [selectedVariation, setSelectedVariation] = useState<number | null>(null);

  // Competitor gap mode
  const [competitorText, setCompetitorText] = useState("");
  const [gapLoading, setGapLoading] = useState(false);
  const [gapResult, setGapResult] = useState<{ rewritten: string; gapAnalysis: string[]; improvements: string[] } | null>(null);

  // Full Listing mode
  const [fullListingMode, setFullListingMode] = useState(false);
  const [fullListingLoading, setFullListingLoading] = useState(false);
  const [fullListingResult, setFullListingResult] = useState<FullListingResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [error, setError] = useState("");

  const currentPlan = useSubscription((s) => s.currentPlan);
  const usageThisPeriod = useSubscription((s) => s.usageThisPeriod);
  const isFeatureGated = useSubscription((s) => s.isFeatureGated);
  const incrementUsage = useSubscription((s) => s.incrementUsage);

  const isMpGated = marketplace === "etsy" || marketplace === "shopify" ? isFeatureGated(marketplace + "-marketplace") : false;
  const isSectionGated = !fullListingMode && (section === "brand-story" || section === "a-plus-content") ? isFeatureGated(section) : false;
  const isFullListingGated = fullListingMode ? isFeatureGated("full-listing-generator") : false;
  const isLimitReached = usageThisPeriod.aiGenerations >= usageThisPeriod.maxGenerations;
  const isFeatureLocked = isMpGated || isSectionGated || isFullListingGated;
  const isGenerationBlocked = isLimitReached || isFeatureLocked;

  // Live char counter
  const charLimit = SECTION_LIMITS[section] || 2000;
  const charPct = Math.min((currentText.length / charLimit) * 100, 100);
  const charColor = charPct > 90 ? "bg-rose-500" : charPct > 70 ? "bg-amber-500" : "bg-[#00c48c]";

  const buildInstructions = () => {
    let instr = instructions;
    if (language !== "English") instr += ` Write in ${language} language/style.`;
    return instr;
  };

  const handleOptimize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerationBlocked) return;
    setLoading(true);
    setOptimizedText("");
    setCopied(false);
    setError("");
    try {
      const result = await optimizeCopy(section, currentText, marketplace, buildInstructions(), tone);
      setOptimizedText(result);
      incrementUsage("aiGenerations");
    } catch (e: any) {
      setError(e?.message || "Failed to optimize copy.");
    } finally {
      setLoading(false);
    }
  };

  const handleVariations = async () => {
    if (!currentText.trim() || isGenerationBlocked) return;
    setVariationsLoading(true);
    setVariations(null);
    setSelectedVariation(null);
    setError("");
    try {
      const result = await generateCopyVariations(section, currentText, marketplace, tone);
      setVariations(result);
      incrementUsage("aiGenerations");
    } catch (e: any) {
      setError(e?.message || "Failed to generate variations.");
    } finally {
      setVariationsLoading(false);
    }
  };

  const handleGapRewrite = async () => {
    if (!currentText.trim() || !competitorText.trim() || isGenerationBlocked) return;
    setGapLoading(true);
    setGapResult(null);
    setError("");
    try {
      const result = await rewriteWithCompetitorGap(currentText, competitorText, section, marketplace);
      setGapResult(result);
      incrementUsage("aiGenerations");
    } catch (e: any) {
      setError(e?.message || "Competitor gap rewrite failed.");
    } finally {
      setGapLoading(false);
    }
  };

  const handleFullListing = async () => {
    if (!currentText.trim() || isGenerationBlocked) return;
    setFullListingLoading(true);
    setFullListingResult(null);
    setError("");
    try {
      const result = await generateFullListing(currentText, marketplace, tone);
      setFullListingResult(result);
      incrementUsage("aiGenerations");
    } catch (e: any) {
      setError(e?.message || "Failed to generate full listing.");
    } finally {
      setFullListingLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const ReadabilityBadge = ({ grade }: { grade: number }) => {
    const color = grade <= 8 ? "text-[#00c48c] bg-[#00c48c]/10 border-[#00c48c]/20"
      : grade <= 10 ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
      : "text-rose-400 bg-rose-400/10 border-rose-400/20";
    const label = grade <= 8 ? "Ideal" : grade <= 10 ? "Moderate" : "Complex";
    return (
      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${color}`}>
        Grade {grade.toFixed(1)} · {label}
      </span>
    );
  };

  const sectionOptions: { id: CopySection; label: string; icon: React.ReactNode }[] = [
    { id: "title", label: "Title", icon: <Type className="w-3 h-3" /> },
    { id: "bullets", label: "Bullets", icon: <Layers className="w-3 h-3" /> },
    { id: "description", label: "Description", icon: <FileText className="w-3 h-3" /> },
    { id: "brand-story", label: "Brand Story", icon: <BookOpen className="w-3 h-3" /> },
    { id: "a-plus-content", label: "A+ Content", icon: <Sparkles className="w-3 h-3" /> },
    { id: "faq", label: "FAQ", icon: <HelpCircle className="w-3 h-3" /> },
    { id: "search-terms", label: "Search Terms", icon: <Search className="w-3 h-3" /> },
  ];

  const marketplaceOptions: { id: CopyMarketplace; label: string }[] = [
    { id: "amazon", label: "Amazon" },
    { id: "flipkart", label: "Flipkart" },
    { id: "meesho", label: "Meesho" },
    { id: "etsy", label: "Etsy" },
    { id: "shopify", label: "Shopify" },
  ];

  const toneOptions: { id: CopyTone; label: string; icon: React.ReactNode }[] = [
    { id: "professional", label: "Professional", icon: <MessageSquare className="w-3 h-3" /> },
    { id: "premium", label: "Premium", icon: <Tag className="w-3 h-3" /> },
    { id: "luxury", label: "Luxury", icon: <Sparkles className="w-3 h-3" /> },
    { id: "friendly", label: "Friendly", icon: <Mic2 className="w-3 h-3" /> },
    { id: "minimal", label: "Minimal", icon: <Zap className="w-3 h-3" /> },
    { id: "conversion-focused", label: "Conversion", icon: <Globe2 className="w-3 h-3" /> },
  ];

  const languages: Language[] = ["English", "Hinglish", "Hindi", "Tamil", "Bengali"];
  const outputModes: { id: OutputMode; label: string; icon: React.ReactNode }[] = [
    { id: "optimize", label: "Optimize", icon: <Wand2 className="w-3 h-3" /> },
    { id: "variations", label: "3 Variations", icon: <Shuffle className="w-3 h-3" /> },
    { id: "competitor-gap", label: "Competitor Gap", icon: <Swords className="w-3 h-3" /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">AI Copywriter</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Generate high-converting product copy — optimize, create variations, or beat competitors section-by-section.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Input Panel */}
        <GlassCard>
          {/* Header row */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-[#00c48c]" />
              <h3 className="text-sm font-bold text-white">Copy Generator</h3>
            </div>
            <button
              onClick={() => setFullListingMode(!fullListingMode)}
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1",
                fullListingMode
                  ? "bg-[#00c48c]/10 text-[#00c48c] border-[#00c48c]/20"
                  : "bg-white/[0.02] text-zinc-500 border-white/[0.06] hover:text-zinc-300",
                isFeatureGated("full-listing-generator") && "border-amber-500/20 text-amber-400/80"
              )}
            >
              {isFeatureGated("full-listing-generator") && <Lock className="w-2.5 h-2.5" />}
              {fullListingMode ? "✦ Full Listing Mode" : "Section Mode"}
            </button>
          </div>

          {/* Output Mode Tabs */}
          {!fullListingMode && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#161719] border border-white/[0.06] mb-4">
              {outputModes.map(m => (
                <button
                  key={m.id}
                  onClick={() => setOutputMode(m.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold transition-all",
                    outputMode === m.id ? "bg-[#00c48c] text-black" : "text-zinc-500 hover:text-zinc-200"
                  )}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Marketplace */}
          <div className="flex flex-col gap-1.5 mb-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Marketplace</label>
            <div className="flex gap-1.5 flex-wrap">
              {marketplaceOptions.map((mp) => {
                const mpGated = mp.id === "etsy" || mp.id === "shopify" ? isFeatureGated(mp.id + "-marketplace") : false;
                return (
                  <button key={mp.id} onClick={() => setMarketplace(mp.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border flex items-center gap-1",
                      marketplace === mp.id ? "bg-[#00c48c]/10 text-[#00c48c] border-[#00c48c]/20"
                        : "bg-white/[0.02] text-zinc-500 border-white/[0.05] hover:text-zinc-300",
                      mpGated && "opacity-50"
                    )}
                  >
                    {mp.label}
                    {mpGated && <Lock className="w-2 h-2 text-zinc-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tone */}
          <div className="flex flex-col gap-1.5 mb-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Writing Tone</label>
            <div className="flex gap-1.5 flex-wrap">
              {toneOptions.map(t => (
                <button key={t.id} onClick={() => setTone(t.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all border",
                    tone === t.id ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                      : "bg-white/[0.02] text-zinc-500 border-white/[0.05] hover:text-zinc-300"
                  )}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="flex flex-col gap-1.5 mb-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Languages className="w-3 h-3" /> Output Language
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {languages.map(lang => (
                <button key={lang} onClick={() => setLanguage(lang)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border",
                    language === lang ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                      : "bg-white/[0.02] text-zinc-500 border-white/[0.05] hover:text-zinc-300"
                  )}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Section (section mode) */}
          {!fullListingMode && (
            <div className="flex flex-col gap-1.5 mb-3">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Section to Optimize</label>
              <div className="flex gap-1.5 flex-wrap">
                {sectionOptions.map(s => {
                  const sGated = s.id === "brand-story" || s.id === "a-plus-content" ? isFeatureGated(s.id) : false;
                  return (
                    <button key={s.id} onClick={() => setSection(s.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all border",
                        section === s.id ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                          : "bg-white/[0.02] text-zinc-500 border-white/[0.05] hover:text-zinc-300",
                        sGated && "opacity-50"
                      )}
                    >
                      {s.icon} {s.label}
                      {sGated && <Lock className="w-2 h-2 text-zinc-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Your Text Input */}
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              {fullListingMode ? "Describe your product" : `Your current ${section}`}
            </label>
            <textarea
              placeholder={fullListingMode
                ? "e.g. A3 glossy anime poster featuring Natsuki Subaru from Re:Zero. 300 GSM paper with laminate."
                : `Paste your current ${section} here...`
              }
              value={currentText}
              onChange={e => setCurrentText(e.target.value)}
              className="w-full min-h-[100px] p-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all placeholder-zinc-600"
            />
            {/* Live character counter */}
            {!fullListingMode && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className={`h-full ${charColor} transition-all`} style={{ width: `${charPct}%` }} />
                </div>
                <span className={cn("text-[10px] font-mono", charPct > 90 ? "text-rose-400" : charPct > 70 ? "text-amber-400" : "text-zinc-600")}>
                  {currentText.length}/{charLimit}
                </span>
              </div>
            )}
          </div>

          {/* Competitor text (gap mode) */}
          {!fullListingMode && outputMode === "competitor-gap" && (
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Swords className="w-3 h-3 text-rose-400" /> Competitor's {section}
              </label>
              <textarea
                placeholder={`Paste competitor's ${section} here…`}
                value={competitorText}
                onChange={e => setCompetitorText(e.target.value)}
                className="w-full min-h-[80px] p-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.02] text-white text-xs focus:outline-none focus:border-rose-500/40 transition-all placeholder-zinc-600"
              />
            </div>
          )}

          {/* Instructions */}
          {!fullListingMode && outputMode === "optimize" && (
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Special Instructions (optional)</label>
              <input
                type="text"
                placeholder="e.g. Focus on eco-friendly messaging, include Hindi keywords"
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white text-xs focus:outline-none focus:border-[#00c48c] transition-all placeholder-zinc-600"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] flex items-start gap-2 text-xs text-rose-300 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {isLimitReached && (
            <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.04] flex flex-col gap-1 text-xs text-rose-300 mb-3">
              <span className="font-bold flex items-center gap-1.5 text-rose-400">
                <AlertTriangle className="w-3 h-3" /> AI Generation Limit Reached
              </span>
              <p>Upgrade to Pro/Business for higher limits.</p>
              <a href="/billing" className="text-[#00c48c] font-bold text-[10px]">View Pricing →</a>
            </div>
          )}

          {!isLimitReached && isFeatureLocked && (
            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] flex flex-col gap-1 text-xs text-amber-300 mb-3">
              <span className="font-bold flex items-center gap-1.5 text-amber-400">
                <Lock className="w-3 h-3" /> Premium Feature Locked
              </span>
              <p>{isFullListingGated && "Full Listing Mode is Pro/Business only."}{isMpGated && `${marketplace.toUpperCase()} is Pro/Business only.`}{isSectionGated && `${section} section is Pro/Business only.`}</p>
              <a href="/billing" className="text-[#00c48c] font-bold text-[10px]">Upgrade →</a>
            </div>
          )}

          {/* Action Buttons */}
          {fullListingMode ? (
            <button onClick={handleFullListing} disabled={fullListingLoading || !currentText || isGenerationBlocked}
              className="w-full h-10 rounded-lg bg-[#00c48c] hover:bg-[#00b07d] text-black font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            >
              {fullListingLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating Full Listing...</> : <><Sparkles className="w-3.5 h-3.5" /> Generate Full Listing</>}
            </button>
          ) : outputMode === "optimize" ? (
            <button onClick={handleOptimize as any} disabled={loading || !currentText || isGenerationBlocked}
              className="w-full h-10 rounded-lg bg-[#00c48c] hover:bg-[#00b07d] text-black font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            >
              {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Optimizing Copy...</> : <><Wand2 className="w-3.5 h-3.5" /> Generate Optimized Copy</>}
            </button>
          ) : outputMode === "variations" ? (
            <button onClick={handleVariations} disabled={variationsLoading || !currentText || isGenerationBlocked}
              className="w-full h-10 rounded-lg bg-[#00c48c] hover:bg-[#00b07d] text-black font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            >
              {variationsLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating Variations...</> : <><Shuffle className="w-3.5 h-3.5" /> Generate 3 Variations</>}
            </button>
          ) : (
            <button onClick={handleGapRewrite} disabled={gapLoading || !currentText || !competitorText || isGenerationBlocked}
              className="w-full h-10 rounded-lg bg-[#00c48c] hover:bg-[#00b07d] text-black font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            >
              {gapLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing Gap...</> : <><Swords className="w-3.5 h-3.5" /> Rewrite to Beat Competitor</>}
            </button>
          )}
        </GlassCard>

        {/* Output Panel */}
        <div className="flex flex-col gap-4">

          {/* ── OPTIMIZE OUTPUT ── */}
          {!fullListingMode && outputMode === "optimize" && (
            <>
              {!optimizedText && !loading && (
                <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8 border-dashed border-white/[0.08]">
                  <FileText className="w-10 h-10 text-zinc-700 mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">Optimized Copy Output</h4>
                  <p className="text-xs text-zinc-600 max-w-[240px] leading-relaxed">Select a section, paste your current text, choose language and tone, then generate.</p>
                </GlassCard>
              )}
              {loading && (
                <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8">
                  <Loader2 className="w-7 h-7 text-[#00c48c] animate-spin mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">Optimizing Your Copy</h4>
                  <p className="text-xs text-zinc-600 max-w-[240px] leading-relaxed">Applying marketplace rules, tone guidelines, and keyword strategy…</p>
                </GlassCard>
              )}
              {optimizedText && (
                <GlassCard className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Optimized {section.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase())}</h3>
                    <button
                      onClick={() => { navigator.clipboard.writeText(optimizedText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="text-[10px] font-semibold text-[#00c48c] hover:text-[#00c48c]/80 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#00c48c]/20 bg-[#00c48c]/[0.04] transition-all"
                    >
                      {copied ? <CopyCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="p-3.5 rounded-lg border border-white/[0.06] bg-white/[0.02] text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                    {optimizedText}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                    <span>{optimizedText.length} chars</span>
                    <span>•</span>
                    <span className="uppercase">{marketplace}</span>
                    <span>•</span>
                    <span className="capitalize">{tone}</span>
                    <span>•</span>
                    <span>{language}</span>
                  </div>
                </GlassCard>
              )}
            </>
          )}

          {/* ── VARIATIONS OUTPUT ── */}
          {!fullListingMode && outputMode === "variations" && (
            <>
              {!variations && !variationsLoading && (
                <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8 border-dashed border-white/[0.08]">
                  <Shuffle className="w-10 h-10 text-zinc-700 mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">3 Copy Variations</h4>
                  <p className="text-xs text-zinc-600 max-w-[240px] leading-relaxed">Get 3 strategic angles — Feature-Led, Emotion-Led, and Value-Led — and pick the one that converts.</p>
                </GlassCard>
              )}
              {variationsLoading && (
                <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8">
                  <Loader2 className="w-7 h-7 text-[#00c48c] animate-spin mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">Generating 3 Strategic Variations</h4>
                  <p className="text-xs text-zinc-600 max-w-[240px] leading-relaxed">Crafting feature, emotion, and value angles with readability scoring…</p>
                </GlassCard>
              )}
              {variations && (
                <div className="flex flex-col gap-3">
                  {variations.map((v, idx) => {
                    const angleColor = v.angle === "feature" ? "border-sky-500/30 bg-sky-500/[0.03]"
                      : v.angle === "emotion" ? "border-pink-500/30 bg-pink-500/[0.03]"
                      : "border-amber-500/30 bg-amber-500/[0.03]";
                    const angleLabel = v.angle === "feature" ? "text-sky-400" : v.angle === "emotion" ? "text-pink-400" : "text-amber-400";
                    const isSelected = selectedVariation === idx;
                    return (
                      <GlassCard key={idx} className={cn("flex flex-col gap-2.5 border", angleColor)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${angleLabel}`}>
                              {v.angle === "feature" ? "⚙" : v.angle === "emotion" ? "💫" : "💰"} {v.label}
                            </span>
                            <ReadabilityBadge grade={v.readabilityGrade} />
                          </div>
                          <button
                            onClick={() => copyToClipboard(v.text, `var-${idx}`)}
                            className="text-[10px] text-zinc-500 hover:text-white transition-colors"
                          >
                            {copiedField === `var-${idx}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{v.text}</p>
                        <div className="text-[9px] text-zinc-600">{v.text.length} chars</div>
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── COMPETITOR GAP OUTPUT ── */}
          {!fullListingMode && outputMode === "competitor-gap" && (
            <>
              {!gapResult && !gapLoading && (
                <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8 border-dashed border-white/[0.08]">
                  <Swords className="w-10 h-10 text-zinc-700 mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">Competitor Gap Rewrite</h4>
                  <p className="text-xs text-zinc-600 max-w-[240px] leading-relaxed">Paste your copy and your competitor's copy. AI identifies gaps and rewrites yours to win.</p>
                </GlassCard>
              )}
              {gapLoading && (
                <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8">
                  <Loader2 className="w-7 h-7 text-[#00c48c] animate-spin mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">Analyzing Competitive Gap</h4>
                  <p className="text-xs text-zinc-600 max-w-[240px] leading-relaxed">Comparing keyword coverage, benefit language, and conversion signals…</p>
                </GlassCard>
              )}
              {gapResult && (
                <div className="flex flex-col gap-3">
                  {/* Rewritten copy */}
                  <GlassCard className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#00c48c] uppercase tracking-wider">✓ Rewritten to Win</span>
                      <button onClick={() => copyToClipboard(gapResult.rewritten, "gap-rewritten")} className="text-[10px] text-zinc-500 hover:text-white transition-colors">
                        {copiedField === "gap-rewritten" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                    <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">{gapResult.rewritten}</p>
                  </GlassCard>
                  {/* Gap Analysis */}
                  <GlassCard className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Gaps Found in Your Copy</span>
                    <ul className="flex flex-col gap-1">
                      {gapResult.gapAnalysis.map((g, i) => (
                        <li key={i} className="flex gap-2 text-xs text-zinc-400">
                          <span className="text-rose-400 shrink-0">✗</span> {g}
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                  {/* Improvements Made */}
                  <GlassCard className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-[#00c48c] uppercase tracking-wider">Improvements Made</span>
                    <ul className="flex flex-col gap-1">
                      {gapResult.improvements.map((imp, i) => (
                        <li key={i} className="flex gap-2 text-xs text-zinc-400">
                          <span className="text-[#00c48c] shrink-0">✓</span> {imp}
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </div>
              )}
            </>
          )}

          {/* ── FULL LISTING OUTPUT ── */}
          {fullListingMode && (
            <>
              {!fullListingResult && !fullListingLoading && (
                <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8 border-dashed border-white/[0.08]">
                  <Layers className="w-10 h-10 text-zinc-700 mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">Full Listing Output</h4>
                  <p className="text-xs text-zinc-600 max-w-[240px] leading-relaxed">Describe your product and generate title, bullets, description, brand story, FAQ, and search terms in one shot.</p>
                </GlassCard>
              )}
              {fullListingLoading && (
                <GlassCard className="h-[460px] flex flex-col items-center justify-center text-center px-8">
                  <Loader2 className="w-7 h-7 text-[#00c48c] animate-spin mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">Generating Complete Listing</h4>
                  <p className="text-xs text-zinc-600 max-w-[240px] leading-relaxed">Creating all sections in a single AI pass…</p>
                </GlassCard>
              )}
              {fullListingResult && (
                <div className="flex flex-col gap-3">
                  <GlassCard className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Generated Listing</h3>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{marketplace} · {tone} · {language}</p>
                    </div>
                    <div className={`px-2.5 py-1 rounded-lg font-bold text-xs ${fullListingResult.seoScore >= 80 ? "bg-[#00c48c]/10 text-[#00c48c]" : fullListingResult.seoScore >= 60 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"}`}>
                      SEO: {fullListingResult.seoScore}/100
                    </div>
                  </GlassCard>
                  {[
                    { key: "title", label: "Title", color: "text-[#00c48c]", value: fullListingResult.title },
                    { key: "desc", label: "Description", color: "text-amber-400", value: fullListingResult.description },
                    { key: "brand", label: "Brand Story", color: "text-pink-400", value: fullListingResult.brandStory },
                    { key: "search", label: "Backend Search Terms", color: "text-violet-400", value: fullListingResult.searchTerms },
                  ].map(item => item.value && (
                    <GlassCard key={item.key} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${item.color}`}>{item.label}</span>
                        <button onClick={() => copyToClipboard(item.value!, item.key)} className="text-[10px] text-zinc-500 hover:text-white transition-colors">
                          {copiedField === item.key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{item.value}</p>
                    </GlassCard>
                  ))}
                  {fullListingResult.bullets?.length > 0 && (
                    <GlassCard className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#00c48c]">Bullet Points</span>
                        <button onClick={() => copyToClipboard(fullListingResult.bullets.join("\n"), "bullets")} className="text-[10px] text-zinc-500 hover:text-white transition-colors">
                          {copiedField === "bullets" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <ul className="flex flex-col gap-1.5 text-xs text-zinc-300">
                        {fullListingResult.bullets.map((b, i) => (
                          <li key={i} className="flex gap-2"><span className="text-[#00c48c] shrink-0">•</span><span>{b}</span></li>
                        ))}
                      </ul>
                    </GlassCard>
                  )}
                  {fullListingResult.faq?.length > 0 && (
                    <GlassCard className="flex flex-col gap-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">FAQ</span>
                      {fullListingResult.faq.map((item, i) => (
                        <div key={i} className="p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.01]">
                          <p className="text-xs font-bold text-zinc-200 mb-1">Q: {item.question}</p>
                          <p className="text-xs text-zinc-500 leading-relaxed">A: {item.answer}</p>
                        </div>
                      ))}
                    </GlassCard>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
