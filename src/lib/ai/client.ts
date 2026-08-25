"use client";

import type {
  AsinKeywordProfile,
  KeywordCluster,
  KeywordRankResult,
  KeywordResult,
  KWInsight,
  KWResearchReport,
  RelatedKeyword,
} from "./keyword-engine";
import type {
  CompetitorComparison,
  CopyMarketplace,
  CopySection,
  CopyTone,
  CopyVariation,
  FullListingResult,
  ProductGenerationResult,
} from "./copywriter";
import type { ListingJudgeReport } from "./listing-judge";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";

async function callTool<T>(tool: string, input: unknown): Promise<T> {
  const response = await sellerplusApiFetch("/api/ai/tools", {
    method: "POST",
    body: JSON.stringify({ tool, input }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "SellerPlus AI could not complete this request.");
  return payload.data as T;
}

export function optimizeCopy(
  section: CopySection,
  currentText: string,
  marketplace: CopyMarketplace,
  instructions: string,
  tone: CopyTone = "professional",
) {
  return callTool<string>("copy.optimize", { section, currentText, marketplace, instructions, tone });
}

export function generateFullListing(
  productDescription: string,
  marketplace: CopyMarketplace,
  tone: CopyTone = "professional",
) {
  return callTool<FullListingResult>("copy.full_listing", { productDescription, marketplace, tone });
}

export function generateCopyVariations(
  section: CopySection,
  currentText: string,
  marketplace: CopyMarketplace,
  tone: CopyTone,
) {
  return callTool<CopyVariation[]>("copy.variations", { section, currentText, marketplace, tone });
}

export function rewriteWithCompetitorGap(
  yourCopy: string,
  competitorCopy: string,
  section: CopySection,
  marketplace: CopyMarketplace,
) {
  return callTool<{ rewritten: string; gapAnalysis: string[]; improvements: string[] }>(
    "copy.competitor_gap",
    { yourCopy, competitorCopy, section, marketplace },
  );
}

export function generateKeywords(productName: string, category: string, competitors: string) {
  return callTool<KeywordResult[]>("keyword.generate", { productName, category, competitors });
}

export function generateKeywordsFromAsin(asin: string, category: string) {
  return callTool<KeywordResult[]>("keyword.reverse_asin", { asin, category });
}

export function deepResearchKeyword(keyword: string, marketplace = "Amazon India") {
  return callTool<{ success: boolean; error?: string; data?: KWResearchReport }>(
    "keyword.deep_research",
    { keyword, marketplace },
  );
}

export function getRelatedKeywords(
  keyword: string,
  category: string,
  marketplace = "Amazon India",
  seedKeywords?: string[],
) {
  return callTool<RelatedKeyword[]>("keyword.related", { keyword, category, marketplace, seedKeywords });
}

export function analyzeAsinKeywords(
  asin: string,
  category: string,
  marketplace = "Amazon India",
  productContext = "",
) {
  return callTool<{ success: boolean; error?: string; data?: AsinKeywordProfile }>(
    "keyword.asin_analysis",
    { asin, category, marketplace, productContext },
  );
}

export function clusterKeywordList(keywords: string[], productContext: string) {
  return callTool<KeywordCluster[]>("keyword.cluster", { keywords, productContext });
}

export function generateKwInsights(
  keyword: string,
  researchData: Partial<KWResearchReport>,
  relatedCount: number,
  competitorCount: number,
) {
  return callTool<KWInsight[]>("keyword.insights", {
    keyword,
    researchData,
    relatedCount,
    competitorCount,
  });
}

export function checkAsinKeywordRanks(
  asin: string,
  keywords: string[],
  category: string,
  marketplace = "Amazon India",
  productContext = "",
) {
  return callTool<{ success: boolean; error?: string; data?: KeywordRankResult[] }>(
    "keyword.ranks",
    { asin, keywords, category, marketplace, productContext },
  );
}

export function auditAmazonUrl(url: string, rawHtmlFallback?: string) {
  return callTool<{ success: boolean; error?: string; report?: ListingJudgeReport }>(
    "listing.audit",
    { url, rawHtmlFallback },
  );
}

export function generateProductFromDescription(details: {
  name: string;
  theme: string;
  size: string;
  material: string;
  targetAudience: string;
  artStyle: string;
  intendedUse: string;
  specialFeatures: string;
}) {
  return callTool<{ success: boolean; error?: string; data?: ProductGenerationResult }>(
    "listing.generate",
    { details },
  );
}

export function compareCompetitors(urls: string[], rawSpecs?: string[]) {
  return callTool<{ success: boolean; error?: string; comparison?: CompetitorComparison }>(
    "listing.compare",
    { urls, rawSpecs },
  );
}

export type {
  AsinKeywordProfile,
  CompetitorComparison,
  CopyMarketplace,
  CopySection,
  CopyTone,
  CopyVariation,
  FullListingResult,
  KeywordCluster,
  KeywordRankResult,
  KeywordResult,
  KWInsight,
  KWResearchReport,
  ListingJudgeReport,
  ProductGenerationResult,
  RelatedKeyword,
};
