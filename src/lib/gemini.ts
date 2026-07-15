/**
 * SellerPlus OS — AI Legacy Interface Bridge
 * 
 * Re-exports all AI capabilities from the modularized @/lib/ai directory.
 * Maintains 100% backward compatibility with components importing from '@/lib/gemini'
 * while eliminating duplicate code.
 */

export {
  // Shared Utilities
  isAiAvailable,
  cleanHtml,
  cleanJsonResponse,
  parseAiJson,
  scrapeUrlText,
  
  // Listing Judge
  auditAmazonUrl,
  
  // AI Copywriter
  generateProductFromDescription,
  compareCompetitors,
  optimizeCopy,
  generateFullListing,
  rewriteListing,
  checkCompliance,
  generateCopyVariations,
  rewriteWithCompetitorGap,
  
  // Keyword Engine
  generateKeywords,
  generateKeywordsFromAsin,
  deepResearchKeyword,
  getRelatedKeywords,
  analyzeAsinKeywords,
  clusterKeywordList,
  generateKwInsights,
  checkAsinKeywordRanks,
} from "./ai";

export type {
  // Shared types
  ScrapeResult,
  
  // Listing Judge types
  ListingJudgeReport,
  
  // AI Copywriter types
  ProductGenerationResult,
  CompetitorComparison,
  CopySection,
  CopyMarketplace,
  CopyTone,
  FullListingResult,
  ListingRewriteResult,
  ComplianceResult,
  CopyVariation,
  
  // Keyword Engine types
  KeywordResult,
  KWResearchReport,
  RelatedKeyword,
  AsinKeywordData,
  AsinKeywordProfile,
  KeywordCluster,
  KWInsight,
  KeywordRankResult,
} from "./ai";
