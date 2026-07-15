/**
 * SellerPlus OS — AI Module Barrel Export
 * 
 * Re-exports all AI service functions and types from their domain modules.
 * This serves as a drop-in replacement for the old monolithic gemini.ts.
 * 
 * Consumers can import from "@/lib/ai" instead of "@/lib/gemini".
 * The old "@/lib/gemini" path is preserved for backward compatibility.
 */

// ─── Shared Utilities ────────────────────────────────────────────────
export { isAiAvailable, cleanHtml, cleanJsonResponse, parseAiJson, scrapeUrlText } from "./utils";
export type { ScrapeResult } from "./utils";

// ─── Listing Judge ───────────────────────────────────────────────────
export { auditAmazonUrl } from "./listing-judge";
export type { ListingJudgeReport } from "./listing-judge";

// ─── AI Copywriter ───────────────────────────────────────────────────
export {
  generateProductFromDescription,
  compareCompetitors,
  optimizeCopy,
  generateFullListing,
  rewriteListing,
  checkCompliance,
  generateCopyVariations,
  rewriteWithCompetitorGap,
} from "./copywriter";

export type {
  ProductGenerationResult,
  CompetitorComparison,
  CopySection,
  CopyMarketplace,
  CopyTone,
  FullListingResult,
  ListingRewriteResult,
  ComplianceResult,
  CopyVariation,
} from "./copywriter";

// ─── Keyword Engine ──────────────────────────────────────────────────
export {
  generateKeywords,
  generateKeywordsFromAsin,
  deepResearchKeyword,
  getRelatedKeywords,
  analyzeAsinKeywords,
  clusterKeywordList,
  generateKwInsights,
  checkAsinKeywordRanks,
} from "./keyword-engine";

export type {
  KeywordResult,
  KWResearchReport,
  RelatedKeyword,
  AsinKeywordData,
  AsinKeywordProfile,
  KeywordCluster,
  KWInsight,
  KeywordRankResult,
} from "./keyword-engine";
