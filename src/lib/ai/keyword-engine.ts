/**
 * SellerPlus keyword intelligence boundary.
 *
 * AI may propose and classify search terms, but it is not a source of Amazon
 * search volume, rank, CPC, or competition measurements. Quantitative methods
 * fail closed until a legitimate data adapter is configured.
 */
import { z } from "zod";
import { generateValidatedJson } from "./schema-validator";

export type KeywordDataSource =
  | "amazon_brand_analytics"
  | "amazon_autocomplete"
  | "external_provider"
  | "ai_inferred";

export interface KeywordResult {
  keyword: string;
  type: "primary" | "secondary" | "long-tail" | "backend" | "hidden-opportunity";
  searchVolume: number | null;
  difficulty: number | null;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  rankingPotential: "high" | "medium" | "low" | "unknown";
  competitorUsage: "common" | "rare" | "untapped" | "unknown";
  suggestedPlacement: "title" | "bullets" | "backend" | "description";
  cluster: string;
  bidMin: number | null;
  bidMax: number | null;
  opportunityScore: number | null;
  trend: "rising" | "stable" | "declining" | "unknown";
  dataSource: KeywordDataSource;
  metricsAvailable: boolean;
}

export interface KWResearchReport {
  keyword: string;
  marketplace: string;
  monthlySearchVolume: number;
  searchVolumeTrend: number[];
  difficultyScore: number;
  opportunityScore: number;
  buyerIntentScore: number;
  competitionLevel: "low" | "medium" | "high" | "very-high";
  sponsoredCompetition: number;
  organicCompetition: number;
  cpcEstimate: number;
  seasonalDemand: "low" | "medium" | "high" | "peak";
  searchFrequencyRank: number;
  clickThroughPotential: number;
  conversionPotential: number;
  relevancyScore: number;
  rankingPotential: "low" | "medium" | "high";
  revenueOpportunity: string;
  topRelatedKeywords: string[];
  aiSummary: string;
  peakMonths: string[];
  trendDirection: "rising" | "stable" | "declining";
  dataSource: Exclude<KeywordDataSource, "ai_inferred">;
}

export interface RelatedKeyword {
  keyword: string;
  type: "related" | "long-tail" | "synonym" | "broad" | "phrase" | "exact" | "misspelling" | "trending" | "ai-suggested";
  searchVolume: number;
  difficulty: number;
  cpc: number;
  opportunityScore: number;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  trend: "rising" | "stable" | "declining";
  wordCount: number;
  seasonality: "evergreen" | "seasonal" | "holiday";
  competitorUsage: "common" | "rare" | "untapped";
  dataSource: Exclude<KeywordDataSource, "ai_inferred">;
}

export interface AsinKeywordData {
  keyword: string;
  estimatedRank: number;
  trafficShare: number;
  isSponsored: boolean;
  isOrganic: boolean;
  searchVolume: number;
  keywordValue: string;
  isGap: boolean;
  difficulty: number;
  intent: "informational" | "commercial" | "transactional" | "navigational";
}

export interface AsinKeywordProfile {
  asin: string;
  estimatedProduct: string;
  category: string;
  totalEstimatedTraffic: number;
  keywords: AsinKeywordData[];
  topTrafficKeywords: string[];
  uniqueKeywords: string[];
  gapOpportunities: string[];
  sharedKeywords: string[];
  organicCount: number;
  sponsoredCount: number;
  aiSummary: string;
  competitiveStrength: "weak" | "moderate" | "strong" | "dominant";
  dataSource: Exclude<KeywordDataSource, "ai_inferred">;
}

export interface KeywordCluster {
  id: string;
  name: string;
  type: "primary" | "secondary" | "long-tail" | "buyer-intent" | "brand" | "seasonal" | "informational" | "high-conversion" | "low-competition";
  keywords: string[];
  avgVolume: number | null;
  avgDifficulty: number | null;
  opportunityLevel: "low" | "medium" | "high" | "unknown";
  recommendedPlacement: string[];
  aiExplanation: string;
  color: string;
  dataSource: "ai_inferred";
}

export interface KWInsight {
  id: string;
  type: "opportunity" | "warning" | "tip" | "competitor" | "trend";
  headline: string;
  detail: string;
  action: string;
  impact: "low" | "medium" | "high";
  relatedKeywords?: string[];
}

export interface KeywordRankResult {
  keyword: string;
  organicRank: number | string;
  sponsoredRank: number | string;
  searchVolume: number;
  difficulty: number;
  rankingStatus: "dominant" | "page-1" | "page-2" | "not-ranking";
  recommendation: string;
  dataSource: Exclude<KeywordDataSource, "ai_inferred">;
}

const keywordIdeaSchema = z.object({
  keyword: z.string().trim().min(1).max(150),
  type: z.enum(["primary", "secondary", "long-tail", "backend", "hidden-opportunity"]),
  intent: z.enum(["informational", "commercial", "transactional", "navigational"]),
  suggestedPlacement: z.enum(["title", "bullets", "backend", "description"]),
  cluster: z.string().trim().min(1).max(80),
}).strict();

const keywordIdeaListSchema = z.array(keywordIdeaSchema).min(5).max(30);

const clusterSchema = z.array(z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(100),
  type: z.enum(["primary", "secondary", "long-tail", "buyer-intent", "brand", "seasonal", "informational", "high-conversion", "low-competition"]),
  keywords: z.array(z.string().trim().min(1).max(150)).min(1).max(100),
  recommendedPlacement: z.array(z.enum(["title", "bullets", "description", "backend", "a-plus", "ads"])).max(6),
  aiExplanation: z.string().trim().min(1).max(500),
  color: z.enum(["emerald", "sky", "amber", "violet", "pink", "orange", "teal", "rose"]),
}).strict()).min(1).max(12);

function unavailable(capability: string) {
  return capability + " requires Amazon Brand Analytics/Search Query Performance or a licensed keyword-data provider. SellerPlus will not fabricate these measurements with an LLM.";
}

function qualitativeResult(idea: z.infer<typeof keywordIdeaSchema>): KeywordResult {
  return {
    ...idea,
    searchVolume: null,
    difficulty: null,
    rankingPotential: "unknown",
    competitorUsage: "unknown",
    bidMin: null,
    bidMax: null,
    opportunityScore: null,
    trend: "unknown",
    dataSource: "ai_inferred",
    metricsAvailable: false,
  };
}

export async function generateKeywords(
  productName: string,
  category: string,
  competitors: string,
  userId?: string,
): Promise<KeywordResult[]> {
  const prompt = [
    "You are the SellerPlus keyword ideation service. Generate semantic Amazon search-term candidates for the seller's actual product.",
    "Do not provide search volume, ranking, CPC, difficulty, trend, competitor usage, or any other measured claim.",
    "Product: " + JSON.stringify(productName),
    "Category: " + JSON.stringify(category),
    "Seller-provided competitor notes: " + JSON.stringify(competitors),
    "Return only a JSON array with 15-25 objects shaped as:",
    "{\"keyword\":\"string\",\"type\":\"primary|secondary|long-tail|backend|hidden-opportunity\",\"intent\":\"informational|commercial|transactional|navigational\",\"suggestedPlacement\":\"title|bullets|backend|description\",\"cluster\":\"string\"}",
    "hidden-opportunity means a semantic niche worth validating; it does not claim competitors missed it. Avoid third-party trademarks and brand names.",
  ].join("\n");

  const ideas = await generateValidatedJson(prompt, keywordIdeaListSchema, { temperature: 0.2 }, userId);
  return ideas.map(qualitativeResult);
}

export async function generateKeywordsFromAsin(
  _asin: string,
  _category: string,
  _userId?: string,
): Promise<KeywordResult[]> {
  throw new Error(unavailable("Reverse-ASIN keyword discovery"));
}

export async function deepResearchKeyword(
  _keyword: string,
  _marketplace = "Amazon India",
  _userId?: string,
): Promise<{ success: boolean; error?: string; data?: KWResearchReport }> {
  return { success: false, error: unavailable("Quantitative keyword research") };
}

export async function getRelatedKeywords(
  _keyword: string,
  _category: string,
  _marketplace = "Amazon India",
  _seedKeywords?: string[],
  _userId?: string,
): Promise<RelatedKeyword[]> {
  throw new Error(unavailable("Related-keyword metrics"));
}

export async function analyzeAsinKeywords(
  _asin: string,
  _category: string,
  _marketplace = "Amazon India",
  _productContext = "",
  _userId?: string,
): Promise<{ success: boolean; error?: string; data?: AsinKeywordProfile }> {
  return { success: false, error: unavailable("ASIN keyword and traffic analysis") };
}

export async function clusterKeywordList(
  keywords: string[],
  productContext: string,
  userId?: string,
): Promise<KeywordCluster[]> {
  const prompt = [
    "Cluster only the supplied keyword strings for this product context: " + JSON.stringify(productContext),
    "Keywords: " + JSON.stringify(keywords),
    "Do not infer search volume, difficulty, rank, CPC, opportunity, or trend.",
    "Return only JSON objects with id, name, type, keywords, recommendedPlacement, aiExplanation, and color.",
  ].join("\n");
  const clusters = await generateValidatedJson(prompt, clusterSchema, { temperature: 0.1 }, userId);
  return clusters.map((cluster) => ({
    ...cluster,
    avgVolume: null,
    avgDifficulty: null,
    opportunityLevel: "unknown",
    dataSource: "ai_inferred",
  }));
}

export async function generateKwInsights(
  _keyword: string,
  researchData: Partial<KWResearchReport>,
  _relatedCount: number,
  _competitorCount: number,
  _userId?: string,
): Promise<KWInsight[]> {
  if (!researchData.dataSource) {
    throw new Error(unavailable("Quantitative keyword insights"));
  }
  throw new Error("Keyword insight execution is not enabled for the configured data provider.");
}

export async function checkAsinKeywordRanks(
  _asin: string,
  _keywords: string[],
  _category: string,
  _marketplace = "Amazon India",
  _productContext = "",
  _userId?: string,
): Promise<{ success: boolean; error?: string; data?: KeywordRankResult[] }> {
  return { success: false, error: unavailable("Keyword rank tracking") };
}
