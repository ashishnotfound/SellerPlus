"use client";

import React, { useState } from "react";
import { GlassCard } from "@/components/glass-card";
import {
  auditAmazonUrl,
  compareCompetitors,
  generateProductFromDescription,
  CompetitorComparison,
  ListingJudgeReport,
  ProductGenerationResult,
} from "@/lib/ai";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  CopyCheck,
  Cpu,
  HelpCircle,
  Link as LinkIcon,
  Loader2,
  Package,
  Plus,
  Scale,
  Sparkles,
  TrendingUp,
  XCircle,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/use-subscription";
import { useAuth } from "@/hooks/use-auth";

export default function ListingJudgePage() {
  const user = useAuth((s) => s.user);
  const [activeTab, setActiveTab] = useState<"audit" | "generate" | "competitor">("audit");

  // Tab 1: URL Audit states
  const [auditUrl, setAuditUrl] = useState("");
  const [auditHtml, setAuditHtml] = useState("");
  const [showHtmlBox, setShowHtmlBox] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<ListingJudgeReport | null>(null);
  const [auditError, setAuditError] = useState("");

  // Tab 2: Describe & Generate states
  const [genDetails, setGenDetails] = useState({
    name: "",
    theme: "",
    size: "",
    material: "",
    targetAudience: "",
    artStyle: "",
    intendedUse: "",
    specialFeatures: "",
  });
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<ProductGenerationResult | null>(null);
  const [genError, setGenError] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Tab 3: Competitor states
  const [compUrls, setCompUrls] = useState<string[]>(["", ""]);
  const [compHtmls, setCompHtmls] = useState<string[]>(["", ""]);
  const [compLoading, setCompLoading] = useState(false);
  const [compReport, setCompReport] = useState<CompetitorComparison | null>(null);
  const [compError, setCompError] = useState("");

  const currentPlan = useSubscription((s) => s.currentPlan);
  const usageThisPeriod = useSubscription((s) => s.usageThisPeriod);
  const isFeatureGated = useSubscription((s) => s.isFeatureGated);
  const incrementUsage = useSubscription((s) => s.incrementUsage);

  const isAuditLimitReached = usageThisPeriod.auditsUsed >= usageThisPeriod.maxAudits;
  const isGenLimitReached = usageThisPeriod.aiGenerations >= usageThisPeriod.maxGenerations;
  const isCompetitorGated = isFeatureGated("competitor-analysis");

  // --- Copy Helper ---
  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // --- Handlers ---
  const handleAuditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuditLimitReached) return;
    setAuditLoading(true);
    setAuditError("");
    setAuditReport(null);

    const res = await auditAmazonUrl(auditUrl, auditHtml, user?.id);
    if (res.success && res.report) {
      setAuditReport(res.report);
      incrementUsage("auditsUsed");
    } else {
      setAuditError(res.error || "Failed to analyze listing.");
    }
    setAuditLoading(false);
  };

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenLimitReached) return;
    setGenLoading(true);
    setGenError("");
    setGenResult(null);

    const res = await generateProductFromDescription(genDetails);
    if (res.success && res.data) {
      setGenResult(res.data);
      incrementUsage("aiGenerations");
    } else {
      setGenError(res.error || "Failed to generate product optimization mapping.");
    }
    setGenLoading(false);
  };

  const handleCompetitorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCompetitorGated || isAuditLimitReached) return;
    setCompLoading(true);
    setCompError("");
    setCompReport(null);

    const res = await compareCompetitors(compUrls, compHtmls.filter(h => h.trim().length > 0));
    if (res.success && res.comparison) {
      setCompReport(res.comparison);
      incrementUsage("auditsUsed");
    } else {
      setCompError(res.error || "Failed to assemble competitor metrics matrix.");
    }
    setCompLoading(false);
  };

  // --- UI Score Ring Helper ---
  const ScoreRing = ({ score, label, max = 100 }: { score: number; label: string; max?: number }) => {
    const radius = 28;
    const stroke = 5;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (score / max) * circumference;

    const getColor = (s: number) => {
      const percentage = (s / max) * 100;
      if (percentage >= 80) return "stroke-emerald-400 text-emerald-400";
      if (percentage >= 60) return "stroke-amber-400 text-amber-400";
      return "stroke-rose-400 text-rose-400";
    };

    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative flex items-center justify-center w-16 h-16">
          <svg className="transform -rotate-90 w-16 h-16">
            <circle className="stroke-white/[0.04]" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={32} cy={32} />
            <circle
              className={`transition-all duration-500 ease-out ${getColor(score)}`}
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={circumference + " " + circumference}
              style={{ strokeDashoffset }}
              r={normalizedRadius}
              cx={32}
              cy={32}
            />
          </svg>
          <span className="absolute text-[11px] font-bold text-white">{Math.round(score)}</span>
        </div>
        <span className="text-[9px] font-semibold tracking-wider text-zinc-400 uppercase text-center">{label}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Product Optimization Console</h1>
        <p className="text-zinc-400 text-sm mt-1">Audit URL performance, generate rich listing files, and monitor competitor operations.</p>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/5 border border-white/5 w-fit">
        <button
          onClick={() => setActiveTab("audit")}
          className={cn(
            "px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all",
            activeTab === "audit" ? "bg-indigo-500 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Cpu className="w-4 h-4" /> Amazon URL Audit
        </button>
        <button
          onClick={() => setActiveTab("generate")}
          className={cn(
            "px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all",
            activeTab === "generate" ? "bg-indigo-500 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Sparkles className="w-4 h-4" /> Describe & Generate
        </button>
        <button
          onClick={() => setActiveTab("competitor")}
          className={cn(
            "px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all",
            activeTab === "competitor" ? "bg-indigo-500 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5",
            isCompetitorGated && "text-zinc-500 hover:text-zinc-400"
          )}
        >
          <Scale className="w-4 h-4" /> Competitor Analysis
          {isCompetitorGated && <Lock className="w-3 h-3 text-zinc-500" />}
        </button>
      </div>

      {/* TAB 1: URL AUDIT */}
      {activeTab === "audit" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <div className="lg:col-span-3 flex flex-col gap-6">
            <GlassCard>
              <h3 className="text-lg font-bold text-white mb-6">Amazon Listing URL Auditor</h3>
              <form onSubmit={handleAuditSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400">Paste Amazon Listing Link</label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="url"
                      placeholder="e.g. https://www.amazon.in/dp/B08X4Y2FJS"
                      value={auditUrl}
                      onChange={(e) => setAuditUrl(e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-zinc-600"
                      required
                    />
                  </div>
                </div>

                {/* Blocker Fallback trigger */}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHtmlBox(!showHtmlBox)}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors text-left"
                  >
                    {showHtmlBox ? "- Hide html fallback box" : "+ Show manual html fallback box (if Amazon crawler gets blocked)"}
                  </button>
                  {showHtmlBox && (
                    <textarea
                      placeholder="Paste page Ctrl+A text or raw HTML here..."
                      value={auditHtml}
                      onChange={(e) => setAuditHtml(e.target.value)}
                      className="w-full min-h-[140px] p-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600 font-mono"
                    />
                  )}
                </div>

                {auditError && (
                  <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 flex items-start gap-3 text-xs text-rose-300 leading-relaxed">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <span>{auditError}</span>
                  </div>
                )}

                {/* Limit reached warning banner */}
                {isAuditLimitReached && (
                  <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 flex flex-col gap-1.5 text-xs text-rose-300 mb-2 leading-relaxed">
                    <span className="font-bold flex items-center gap-1.5 text-rose-400">
                      <AlertTriangle className="w-4 h-4" /> Listing Audit Limit Reached
                    </span>
                    <p>You have performed {usageThisPeriod.auditsUsed} of {usageThisPeriod.maxAudits} audits this period. Upgrade your subscription to Weekly, Pro, or Business to audit more listings.</p>
                    <a href="/billing" className="text-indigo-400 hover:text-indigo-300 font-bold text-[11px] w-fit mt-1 flex items-center gap-1">
                      View Pricing Plans →
                    </a>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={auditLoading || isAuditLimitReached}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-400 to-emerald-400 hover:opacity-90 text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity mt-2"
                >
                  {auditLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing Amazon Webpage...
                    </>
                  ) : (
                    "Fetch and Analyze Listing"
                  )}
                </button>
              </form>
            </GlassCard>
          </div>

          {/* Tab 1 Results Column */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {!auditReport && !auditLoading && (
              <GlassCard className="h-[300px] flex flex-col items-center justify-center text-center px-8 border-dashed border-white/10">
                <HelpCircle className="w-12 h-12 text-zinc-600 mb-4" />
                <h4 className="text-base font-bold text-white mb-2">Audit Report Center</h4>
                <p className="text-xs text-zinc-500 max-w-[240px] leading-relaxed">
                  Provide an Amazon listing link and scan to perform complete structural audit of conversions and SEO.
                </p>
              </GlassCard>
            )}

            {auditLoading && (
              <GlassCard className="h-[300px] flex flex-col items-center justify-center text-center px-8">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
                <h4 className="text-base font-bold text-white mb-2">Executing Crawler Auditing Engine</h4>
                <p className="text-xs text-zinc-500 max-w-[240px] leading-relaxed">
                  Loading source layout, analyzing keyword density thresholds, and generating recommendations.
                </p>
              </GlassCard>
            )}

            {auditReport && (
              <>
                {/* Visual scorecard */}
                <GlassCard className="flex flex-col items-center text-center gap-6">
                  <div>
                    <h3 className="text-base font-bold text-white">Listing Evaluation Grade</h3>
                    <p className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase mt-0.5">Overall Score</p>
                  </div>
                  
                  <div className="relative flex items-center justify-center w-24 h-24">
                    <svg className="transform -rotate-90 w-24 h-24">
                      <circle className="stroke-white/[0.04]" fill="transparent" strokeWidth={6} r={42} cx={48} cy={48} />
                      <circle
                        className={`transition-all duration-500 ease-out ${auditReport.overallScore >= 80 ? "stroke-emerald-400" : auditReport.overallScore >= 60 ? "stroke-amber-400" : "stroke-rose-400"}`}
                        fill="transparent"
                        strokeWidth={6}
                        strokeDasharray={2 * Math.PI * 42}
                        strokeDashoffset={2 * Math.PI * 42 - (auditReport.overallScore / 100) * (2 * Math.PI * 42)}
                        r={42}
                        cx={48}
                        cy={48}
                      />
                    </svg>
                    <span className="absolute text-2xl font-black text-white">{Math.round(auditReport.overallScore)}</span>
                  </div>

                  <div className="grid grid-cols-5 gap-1 w-full pt-4 border-t border-white/5">
                    <ScoreRing score={auditReport.scores.seo} label="SEO" />
                    <ScoreRing score={auditReport.scores.conversion} label="Conv" />
                    <ScoreRing score={auditReport.scores.keywords} label="Keywords" />
                    <ScoreRing score={auditReport.scores.image} label="Image" />
                    <ScoreRing score={auditReport.scores.competitiveness} label="Comp" />
                  </div>
                </GlassCard>

                {/* Scanned listing properties */}
                <GlassCard className="flex flex-col gap-4">
                  <h3 className="text-sm font-bold text-white">Scanned Listing Properties</h3>
                  <div className="flex flex-col gap-2.5 text-xs text-zinc-300">
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-zinc-500">Title length</span>
                      <span className="font-mono text-zinc-200">{auditReport.extractedDetails.title?.length || 0} / {auditReport.titleAnalysis?.maxRecommended || 200} chars</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-zinc-500">Extracted price</span>
                      <span className="font-mono text-zinc-200 font-bold text-emerald-400">{auditReport.extractedDetails.price}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-zinc-500">Bullet points</span>
                      <span className="font-mono text-zinc-200">{auditReport.extractedDetails.bullets?.length || 0} found</span>
                    </div>
                    {auditReport.titleAnalysis?.readabilityScore !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Title readability</span>
                        <span className={`font-mono font-bold ${auditReport.titleAnalysis.readabilityScore >= 80 ? "text-emerald-400" : auditReport.titleAnalysis.readabilityScore >= 60 ? "text-amber-400" : "text-rose-400"}`}>
                          {Math.round(auditReport.titleAnalysis.readabilityScore)}/100
                        </span>
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* Title Analysis */}
                {auditReport.titleAnalysis && (
                  <GlassCard className="flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-white">Title Analysis</h3>
                    {auditReport.titleAnalysis.keywordsFound?.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Keywords Found</span>
                        <div className="flex flex-wrap gap-1.5">
                          {auditReport.titleAnalysis.keywordsFound.map((kw, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono text-[10px]">{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {auditReport.titleAnalysis.keywordsMissing?.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Keywords Missing</span>
                        <div className="flex flex-wrap gap-1.5">
                          {auditReport.titleAnalysis.keywordsMissing.map((kw, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-mono text-[10px]">{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {auditReport.titleAnalysis.issues?.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {auditReport.titleAnalysis.issues.map((issue, i) => (
                          <div key={i} className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.02] text-xs flex gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <span className="text-zinc-400">{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                )}

                {/* Bullet & Description Analysis */}
                {(auditReport.bulletAnalysis || auditReport.descriptionAnalysis) && (
                  <GlassCard className="flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-white">Content Analysis</h3>
                    {auditReport.bulletAnalysis && (
                      <div className="flex flex-col gap-2 p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Bullet Points</span>
                        <div className="flex flex-col gap-1 text-xs text-zinc-400">
                          <div className="flex justify-between"><span>Count</span><span className="text-zinc-200 font-mono">{auditReport.bulletAnalysis.count}</span></div>
                          <div className="flex justify-between"><span>Customer Appeal</span><span className={`font-bold ${auditReport.bulletAnalysis.customerAppeal === "high" ? "text-emerald-400" : auditReport.bulletAnalysis.customerAppeal === "medium" ? "text-amber-400" : "text-rose-400"}`}>{auditReport.bulletAnalysis.customerAppeal}</span></div>
                          <div className="flex justify-between"><span>SEO Quality</span><span className={`font-bold ${auditReport.bulletAnalysis.seoQuality === "strong" ? "text-emerald-400" : auditReport.bulletAnalysis.seoQuality === "moderate" ? "text-amber-400" : "text-rose-400"}`}>{auditReport.bulletAnalysis.seoQuality}</span></div>
                          {auditReport.bulletAnalysis.benefitsVsFeatures && <p className="text-zinc-500 text-[10px] mt-1">{auditReport.bulletAnalysis.benefitsVsFeatures}</p>}
                        </div>
                      </div>
                    )}
                    {auditReport.descriptionAnalysis && (
                      <div className="flex flex-col gap-2 p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Description</span>
                        <div className="flex flex-col gap-1 text-xs text-zinc-400">
                          <div className="flex justify-between"><span>Conversion Potential</span><span className={`font-bold ${auditReport.descriptionAnalysis.conversionPotential === "high" ? "text-emerald-400" : auditReport.descriptionAnalysis.conversionPotential === "medium" ? "text-amber-400" : "text-rose-400"}`}>{auditReport.descriptionAnalysis.conversionPotential}</span></div>
                          <div className="flex justify-between"><span>Formatting Quality</span><span className={`font-bold ${auditReport.descriptionAnalysis.formattingQuality === "excellent" ? "text-emerald-400" : auditReport.descriptionAnalysis.formattingQuality === "adequate" ? "text-amber-400" : "text-rose-400"}`}>{auditReport.descriptionAnalysis.formattingQuality}</span></div>
                        </div>
                        {auditReport.descriptionAnalysis.suggestions?.length > 0 && (
                          <ul className="list-disc list-inside text-[11px] text-zinc-500 flex flex-col gap-0.5 mt-1">
                            {auditReport.descriptionAnalysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        )}
                      </div>
                    )}
                  </GlassCard>
                )}

                {/* Image Analysis */}
                {auditReport.imageAnalysis && (
                  <GlassCard className="flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-white">Image Analysis</h3>
                    <div className="flex justify-between text-xs text-zinc-400 border-b border-white/5 pb-2">
                      <span>Estimated images</span>
                      <span className="font-mono text-zinc-200">{auditReport.imageAnalysis.estimatedCount} / {auditReport.imageAnalysis.recommendedCount} recommended</span>
                    </div>
                    {auditReport.imageAnalysis.missingTypes?.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Missing Image Types</span>
                        <div className="flex flex-wrap gap-1.5">
                          {auditReport.imageAnalysis.missingTypes.map((type, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]">{type}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </GlassCard>
                )}

                {/* Strengths & Weaknesses side by side */}
                <GlassCard className="flex flex-col gap-4">
                  <h3 className="text-sm font-bold text-white">Evaluation Verdict</h3>
                  <div className="flex flex-col gap-3.5">
                    {auditReport.strengths?.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" /> Strengths
                        </span>
                        <ul className="list-disc list-inside text-[11px] text-zinc-400 flex flex-col gap-1 pl-1">
                          {auditReport.strengths.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                    {auditReport.weaknesses?.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5" /> Weaknesses
                        </span>
                        <ul className="list-disc list-inside text-[11px] text-zinc-400 flex flex-col gap-1 pl-1">
                          {auditReport.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* Prioritized Action Steps */}
                {auditReport.actionSteps?.length > 0 && (
                  <GlassCard className="flex flex-col gap-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-indigo-400" /> Action Steps
                    </h3>
                    <div className="flex flex-col gap-2">
                      {auditReport.actionSteps.map((step, i) => (
                        <div key={i} className="flex gap-3 p-3 rounded-xl border border-indigo-500/15 bg-indigo-500/[0.02] text-xs">
                          <span className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-[10px] flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="text-zinc-300 leading-relaxed">{step}</span>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DESCRIBE & GENERATE */}
      {activeTab === "generate" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <GlassCard>
              <h3 className="text-lg font-bold text-white mb-6">Describe Your Product</h3>
              <form onSubmit={handleGenerateSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Product Name</label>
                  <input
                    type="text"
                    placeholder="e.g. A3 Anime Poster Subaru Re:Zero"
                    value={genDetails.name}
                    onChange={(e) => setGenDetails({ ...genDetails, name: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Theme / Character</label>
                    <input
                      type="text"
                      placeholder="e.g. Natsuki Subaru all forms"
                      value={genDetails.theme}
                      onChange={(e) => setGenDetails({ ...genDetails, theme: e.target.value })}
                      className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Dimensions / Size</label>
                    <input
                      type="text"
                      placeholder="e.g. A3 Size (11.7 x 16.5 inches)"
                      value={genDetails.size}
                      onChange={(e) => setGenDetails({ ...genDetails, size: e.target.value })}
                      className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Material</label>
                    <input
                      type="text"
                      placeholder="e.g. 300 GSM glossy paper"
                      value={genDetails.material}
                      onChange={(e) => setGenDetails({ ...genDetails, material: e.target.value })}
                      className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target Audience</label>
                    <input
                      type="text"
                      placeholder="e.g. Anime fans, room decorators"
                      value={genDetails.targetAudience}
                      onChange={(e) => setGenDetails({ ...genDetails, targetAudience: e.target.value })}
                      className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Art Style</label>
                    <input
                      type="text"
                      placeholder="e.g. Vibrant manga art print"
                      value={genDetails.artStyle}
                      onChange={(e) => setGenDetails({ ...genDetails, artStyle: e.target.value })}
                      className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Intended Use</label>
                    <input
                      type="text"
                      placeholder="e.g. Room decoration, gift"
                      value={genDetails.intendedUse}
                      onChange={(e) => setGenDetails({ ...genDetails, intendedUse: e.target.value })}
                      className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Special Features / description</label>
                  <textarea
                    placeholder="e.g. High resolution offset prints, scratch resistant protective laminate film..."
                    value={genDetails.specialFeatures}
                    onChange={(e) => setGenDetails({ ...genDetails, specialFeatures: e.target.value })}
                    className="w-full min-h-[90px] p-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600"
                  />
                </div>

                {genError && (
                  <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 flex items-start gap-3 text-xs text-rose-300 leading-relaxed">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <span>{genError}</span>
                  </div>
                )}

                {/* Limit reached warning banner */}
                {isGenLimitReached && (
                  <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 flex flex-col gap-1.5 text-xs text-rose-300 mb-2 leading-relaxed">
                    <span className="font-bold flex items-center gap-1.5 text-rose-400">
                      <AlertTriangle className="w-4 h-4" /> AI Generation Limit Reached
                    </span>
                    <p>You have generated {usageThisPeriod.aiGenerations} of {usageThisPeriod.maxGenerations} items this period. Upgrade your subscription to Weekly, Pro, or Business to generate more listings.</p>
                    <a href="/billing" className="text-indigo-400 hover:text-indigo-300 font-bold text-[11px] w-fit mt-1 flex items-center gap-1">
                      View Pricing Plans →
                    </a>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={genLoading || isGenLimitReached}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-400 to-emerald-400 hover:opacity-90 text-black font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity mt-2"
                >
                  {genLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating Optimized Listing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Create Listing Details
                    </>
                  )}
                </button>
              </form>
            </GlassCard>
          </div>

          {/* Tab 2 Results Column */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            {!genResult && !genLoading && (
              <GlassCard className="h-[430px] flex flex-col items-center justify-center text-center px-8 border-dashed border-white/10">
                <Sparkles className="w-12 h-12 text-zinc-600 mb-4" />
                <h4 className="text-base font-bold text-white mb-2">AI Product Listing Canvas</h4>
                <p className="text-xs text-zinc-500 max-w-[260px] leading-relaxed">
                  Provide descriptive information about your product on the left to generate titles, descriptions, and attribute suggestions.
                </p>
              </GlassCard>
            )}

            {genLoading && (
              <GlassCard className="h-[430px] flex flex-col items-center justify-center text-center px-8">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
                <h4 className="text-base font-bold text-white mb-2">Composing Amazon Optimized Listing</h4>
                <p className="text-xs text-zinc-500 max-w-[260px] leading-relaxed">
                  Synthesizing copy, selecting target search terms, and calculating search-engine keyword placement scores.
                </p>
              </GlassCard>
            )}

            {genResult && (
              <div className="flex flex-col gap-6">
                {/* Title & score */}
                <GlassCard className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white">Generated Amazon Title</h3>
                      <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider mt-0.5">Optimized for CTR</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-1 rounded-lg text-xs font-bold font-mono">
                        SEO Score: {genResult.seoScore}%
                      </div>
                      <button
                        onClick={() => copyToClipboard(genResult.title, "title")}
                        className="p-2 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:text-white transition-colors"
                      >
                        {copiedField === "title" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-zinc-200 leading-relaxed bg-white/[0.01] border border-white/5 p-4 rounded-xl">
                    {genResult.title}
                  </p>
                </GlassCard>

                {/* Bullets */}
                <GlassCard className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-white">Bullet Points (Features)</h3>
                    <button
                      onClick={() => copyToClipboard(genResult.bullets.join("\n"), "bullets")}
                      className="p-2 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:text-white transition-colors"
                    >
                      {copiedField === "bullets" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {genResult.bullets.map((bullet, idx) => (
                      <p key={idx} className="text-xs text-zinc-300 leading-relaxed bg-white/[0.01] border border-white/5 p-3.5 rounded-xl">
                        {bullet}
                      </p>
                    ))}
                  </div>
                </GlassCard>

                {/* Description */}
                <GlassCard className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-white">Product Description</h3>
                    <button
                      onClick={() => copyToClipboard(genResult.description, "desc")}
                      className="p-2 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:text-white transition-colors"
                    >
                      {copiedField === "desc" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed bg-white/[0.01] border border-white/5 p-4 rounded-xl whitespace-pre-line">
                    {genResult.description}
                  </p>
                </GlassCard>

                {/* Backend Search terms */}
                <GlassCard className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-bold text-white">Backend Search Keywords</h3>
                    <button
                      onClick={() => copyToClipboard(genResult.searchTerms.join(", "), "search")}
                      className="p-2 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:text-white transition-colors"
                    >
                      {copiedField === "search" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {genResult.searchTerms.map((kw, idx) => (
                      <span key={idx} className="px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono text-xs">
                        {kw}
                      </span>
                    ))}
                  </div>
                </GlassCard>

                {/* Suggested attributes */}
                <GlassCard className="flex flex-col gap-4">
                  <h3 className="text-base font-bold text-white">Listing Metadata & Attributes</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(genResult.attributes).map(([key, val]) => (
                      <div key={key} className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex flex-col gap-1">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">{key.replace(/([A-Z])/g, " $1")}</span>
                        <span className="text-xs font-semibold text-zinc-200">{val}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                {/* Category Recommendations */}
                <GlassCard className="flex flex-col gap-4">
                  <h3 className="text-base font-bold text-white">Category Recommendations</h3>
                  <div className="flex flex-col gap-3.5 text-xs text-zinc-300">
                    <div className="flex flex-col gap-1 border-b border-white/5 pb-3">
                      <span className="text-indigo-400 font-semibold uppercase text-[9px] tracking-wider">Occasions & Demographics</span>
                      <p className="text-zinc-400 leading-relaxed mt-0.5">{genResult.occasionSuggestions.join(", ")}, for {genResult.targetAudienceSuggestions.join(", ")}</p>
                    </div>
                    <div className="flex flex-col gap-1 border-b border-white/5 pb-3">
                      <span className="text-indigo-400 font-semibold uppercase text-[9px] tracking-wider">Aesthetic recommendations</span>
                      <p className="text-zinc-400 leading-relaxed mt-0.5">{genResult.styleThemeRecommendations.join(", ")}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-indigo-400 font-semibold uppercase text-[9px] tracking-wider">Finishes & Color combinations</span>
                      <p className="text-zinc-400 leading-relaxed mt-0.5">{genResult.colorFinishRecommendations.join(", ")}</p>
                    </div>
                  </div>
                </GlassCard>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: COMPETITOR ANALYSIS */}
      {activeTab === "competitor" && (
        <div className="flex flex-col gap-6">
          <GlassCard>
            <h3 className="text-lg font-bold text-white mb-4">Competitor Benchmarking Matrix</h3>
            <p className="text-zinc-400 text-xs mb-6">Compare up to 3 competitor product links side-by-side to analyze design differences and pricing strategies.</p>
            
            <form onSubmit={handleCompetitorSubmit} className="flex flex-col gap-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {compUrls.map((url, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-zinc-400">Competitor Product #{idx + 1} URL</label>
                    <input
                      type="url"
                      placeholder="e.g. https://www.amazon.in/dp/B08X4Y2FJS"
                      value={url}
                      onChange={(e) => {
                        const next = [...compUrls];
                        next[idx] = e.target.value;
                        setCompUrls(next);
                      }}
                      className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-xs focus:outline-none focus:border-indigo-500 transition-all placeholder-zinc-600"
                    />
                  </div>
                ))}
              </div>

              {compUrls.length < 3 && (
                <button
                  type="button"
                  onClick={() => {
                    setCompUrls([...compUrls, ""]);
                    setCompHtmls([...compHtmls, ""]);
                  }}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors text-left"
                >
                  + Add another competitor
                </button>
              )}

              {compError && (
                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-xs text-rose-300 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{compError}</span>
                </div>
              )}

              {/* Gated warning banner */}
              {isCompetitorGated && (
                <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex flex-col gap-1.5 text-xs text-indigo-300 leading-relaxed mb-4">
                  <span className="font-bold flex items-center gap-1.5 text-indigo-400">
                    <Lock className="w-4 h-4" /> Premium Feature Locked
                  </span>
                  <p>Competitor Benchmarking Matrix is a premium feature available on Weekly, Pro, and Business tiers. Upgrade to compare multiple products side-by-side.</p>
                  <a href="/billing" className="text-emerald-400 hover:text-emerald-300 font-bold text-[11px] w-fit mt-1 flex items-center gap-1">
                    Upgrade Plan to Unlock →
                  </a>
                </div>
              )}

              {/* Limit reached warning banner */}
              {!isCompetitorGated && isAuditLimitReached && (
                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 flex flex-col gap-1.5 text-xs text-rose-300 leading-relaxed mb-4">
                  <span className="font-bold flex items-center gap-1.5 text-rose-400">
                    <AlertTriangle className="w-4 h-4" /> Listing Audit Limit Reached
                  </span>
                  <p>You have performed {usageThisPeriod.auditsUsed} of {usageThisPeriod.maxAudits} audits this period. Upgrade your subscription to Weekly, Pro, or Business to compare more listings.</p>
                  <a href="/billing" className="text-indigo-400 hover:text-indigo-300 font-bold text-[11px] w-fit mt-1 flex items-center gap-1">
                    View Pricing Plans →
                  </a>
                </div>
              )}

              <button
                type="submit"
                disabled={compLoading || isCompetitorGated || isAuditLimitReached}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-400 to-emerald-400 hover:opacity-90 text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
              >
                {compLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Assembling Comparison...
                  </>
                ) : (
                  <>
                    <Scale className="w-4 h-4" /> Compare Competitors
                  </>
                )}
              </button>
            </form>
          </GlassCard>

          {/* Results Comparison table */}
          {compLoading && (
            <GlassCard className="py-20 text-center flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
              <h4 className="text-base font-bold text-white mb-2">Analyzing Competitor Listings</h4>
              <p className="text-xs text-zinc-500 max-w-[240px] leading-relaxed">
                Assembling metrics, auditing design quality, and outlining strategic opportunities.
              </p>
            </GlassCard>
          )}

          {!compReport && !compLoading && (
            <GlassCard className="py-20 text-center border-dashed border-white/10 text-zinc-500 text-sm">
              Enter competitor URLs above and run analysis to populate comparison matrix.
            </GlassCard>
          )}

          {compReport && (
            <div className="flex flex-col gap-6">
              <GlassCard>
                <h3 className="text-base font-bold text-white mb-4">Competitor Matrix</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500 font-semibold h-9">
                        <th>Product Details</th>
                        <th>Price</th>
                        <th>SEO Score</th>
                        <th>Bullet Quality</th>
                        <th>Image Evaluation</th>
                        <th>Keywords Density</th>
                        <th>Key Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {compReport.competitors.map((comp, idx) => (
                        <tr key={idx} className="h-14 hover:bg-white/[0.01] transition-colors">
                          <td className="max-w-[220px]">
                            <div className="flex flex-col gap-1 py-1">
                              <span className="font-semibold text-zinc-200 truncate block">{comp.title}</span>
                              <span className="text-[10px] text-zinc-500 truncate block">{comp.url}</span>
                            </div>
                          </td>
                          <td className="font-mono text-zinc-300">{comp.price}</td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "font-bold font-mono px-2 py-0.5 rounded text-[10px]",
                                comp.seoStrength > 75 ? "bg-emerald-500/10 text-emerald-400" :
                                comp.seoStrength > 50 ? "bg-amber-500/10 text-amber-400" :
                                "bg-rose-500/10 text-rose-400"
                              )}>
                                {comp.seoStrength}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                              comp.bulletQuality === 'Strong' ? 'bg-emerald-500/10 text-emerald-400' :
                              comp.bulletQuality === 'Moderate' ? 'bg-amber-500/10 text-amber-400' :
                              'bg-rose-500/10 text-rose-400'
                            )}>
                              {comp.bulletQuality}
                            </span>
                          </td>
                          <td className="text-zinc-400 max-w-[150px] truncate">{comp.imageEvaluation}</td>
                          <td className="text-zinc-400 max-w-[150px] truncate">{comp.keywordsDensity}</td>
                          <td className="text-indigo-300 font-medium max-w-[150px] truncate">{comp.keyDifference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              {/* Actionable items */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <GlassCard>
                  <h4 className="text-sm font-bold text-white mb-2">Competitor Analysis Verdict</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line">{compReport.verdict}</p>
                </GlassCard>
                <GlassCard>
                  <h4 className="text-sm font-bold text-white mb-2">Core Opportunities Map</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line">{compReport.opportunitySummary}</p>
                </GlassCard>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
