/**
 * SellerPlus OS — AI Keyword Engine
 * 
 * Complete keyword intelligence system for Amazon sellers.
 * Routes requests through the centralized AI Gateway.
 */

import { routeLLMRequest, isAiAvailable, cleanJsonResponse } from "./utils";
import { ProviderCapability } from "./types";

// ─── Types ───────────────────────────────────────────────────────────

export interface KeywordResult {
  keyword: string;
  type: "primary" | "secondary" | "long-tail" | "backend" | "hidden-opportunity";
  searchVolume: number;
  difficulty: number;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  rankingPotential: "high" | "medium" | "low";
  competitorUsage: "common" | "rare" | "untapped";
  suggestedPlacement: "title" | "bullets" | "backend" | "description";
  cluster: string;
  bidMin: number;
  bidMax: number;
  opportunityScore: number;
  trend: "rising" | "stable" | "declining";
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
}

export interface KeywordCluster {
  id: string;
  name: string;
  type: "primary" | "secondary" | "long-tail" | "buyer-intent" | "brand" | "seasonal" | "informational" | "high-conversion" | "low-competition";
  keywords: string[];
  avgVolume: number;
  avgDifficulty: number;
  opportunityLevel: "low" | "medium" | "high";
  recommendedPlacement: string[];
  aiExplanation: string;
  color: string;
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
}

// ─── Core Functions ──────────────────────────────────────────────────

export async function generateKeywords(
  productName: string,
  category: string,
  competitors: string,
  userId?: string
): Promise<KeywordResult[]> {
  if (!isAiAvailable()) return [];

  try {
    const prompt = `
      You are Gemini Keyword Engine™, a professional keyword intelligence system comparable to Helium10 and Jungle Scout.
      
      Analyze the following product, category, and competitor context. Generate 20-25 highly relevant, marketplace-optimized keywords.

      Product Name: ${productName}
      Category: ${category}
      Competitor Context: ${competitors}

      Requirements:
      - Include a mix: 4-5 primary, 3-4 secondary, 5-6 long-tail, 3-4 backend, and 3-4 hidden-opportunity keywords
      - Hidden opportunities = keywords competitors are NOT targeting but have real buyer search volume
      - Estimate search volume realistically (don't inflate — use plausible India/global marketplace numbers)
      - Difficulty should reflect actual competition density (0-100)
      - Suggest where each keyword should be placed: title, bullets, backend, or description
      - Indicate whether competitors commonly use, rarely use, or haven't tapped each keyword
      - Assign each keyword to a semantic cluster (e.g. "size", "material", "use-case", "audience", "style")
      - Estimate realistic PPC CPC bid range in INR (bidMin and bidMax, e.g. 3 and 12)
      - Calculate opportunityScore = round((searchVolume/1000) * (1 - difficulty/100) * rankingMultiplier) capped at 100
      - Assign trend based on seasonal/market signals: "rising", "stable", or "declining"

      Return ONLY a JSON array (no markdown wrapping):
      [
        {
          "keyword": "string",
          "type": "primary" | "secondary" | "long-tail" | "backend" | "hidden-opportunity",
          "searchVolume": number,
          "difficulty": number (0-100),
          "intent": "informational" | "commercial" | "transactional" | "navigational",
          "rankingPotential": "high" | "medium" | "low",
          "competitorUsage": "common" | "rare" | "untapped",
          "suggestedPlacement": "title" | "bullets" | "backend" | "description",
          "cluster": "string (semantic group name)",
          "bidMin": number (INR),
          "bidMax": number (INR),
          "opportunityScore": number (0-100),
          "trend": "rising" | "stable" | "declining"
        }
      ]
    `;

    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return JSON.parse(cleanJsonResponse(text)) as KeywordResult[];
  } catch (error) {
    console.error("[KeywordEngine] generateKeywords error:", error);
    throw new Error("Failed to generate keywords. Please try again.");
  }
}

export async function generateKeywordsFromAsin(
  asin: string,
  category: string,
  userId?: string
): Promise<KeywordResult[]> {
  if (!isAiAvailable()) return [];
  try {
    const prompt = `
      You are Gemini Keyword Engine™. A seller has provided competitor ASIN: ${asin} in category: ${category}.
      Based on your training data and knowledge of Amazon ranking patterns, infer and generate 18-22 keywords that this ASIN most likely ranks for organically.

      Think about: typical product type for this ASIN pattern, category-specific ranking keywords, long-tail buyer searches, backend hidden terms.

      Return ONLY a JSON array (no markdown):
      [
        {
          "keyword": "string",
          "type": "primary" | "secondary" | "long-tail" | "backend" | "hidden-opportunity",
          "searchVolume": number,
          "difficulty": number (0-100),
          "intent": "informational" | "commercial" | "transactional" | "navigational",
          "rankingPotential": "high" | "medium" | "low",
          "competitorUsage": "common" | "rare" | "untapped",
          "suggestedPlacement": "title" | "bullets" | "backend" | "description",
          "cluster": "string",
          "bidMin": number,
          "bidMax": number,
          "opportunityScore": number (0-100),
          "trend": "rising" | "stable" | "declining"
        }
      ]
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return JSON.parse(cleanJsonResponse(text)) as KeywordResult[];
  } catch (error) {
    console.error("[KeywordEngine] reverseAsin error:", error);
    throw new Error("Reverse ASIN lookup failed. Please try again.");
  }
}

// ─── Deep Research ───────────────────────────────────────────────────

export async function deepResearchKeyword(
  keyword: string,
  marketplace: string = "Amazon India",
  userId?: string
): Promise<{ success: boolean; error?: string; data?: KWResearchReport }> {
  if (!isAiAvailable()) return { success: false, error: "Gemini API key is not configured." };
  try {
    const prompt = `
      You are Amazon KW™, an elite keyword intelligence engine comparable to Helium10 and Jungle Scout.
      Perform a deep keyword analysis for: "${keyword}" on ${marketplace}.

      Think like a senior Amazon SEO strategist. Generate realistic, data-driven estimates based on your knowledge of Amazon India/global marketplace dynamics, category competition, and buyer behavior patterns.

      Return ONLY a JSON object with NO markdown wrapping:
      {
        "keyword": "${keyword}",
        "marketplace": "${marketplace}",
        "monthlySearchVolume": number,
        "searchVolumeTrend": [12 monthly values Jan-Dec as percentage of peak volume],
        "difficultyScore": number (0-100),
        "opportunityScore": number (0-100),
        "buyerIntentScore": number (0-100),
        "competitionLevel": "low" | "medium" | "high" | "very-high",
        "sponsoredCompetition": number (0-100),
        "organicCompetition": number (0-100),
        "cpcEstimate": number (INR),
        "seasonalDemand": "low" | "medium" | "high" | "peak",
        "searchFrequencyRank": number,
        "clickThroughPotential": number (0-100),
        "conversionPotential": number (0-100),
        "relevancyScore": number (0-100),
        "rankingPotential": "low" | "medium" | "high",
        "revenueOpportunity": "string",
        "topRelatedKeywords": ["5-8 related keywords"],
        "aiSummary": "3-4 sentence expert assessment",
        "peakMonths": ["month names"],
        "trendDirection": "rising" | "stable" | "declining"
      }
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return { success: true, data: JSON.parse(cleanJsonResponse(text)) as KWResearchReport };
  } catch (error) {
    console.error("[KeywordEngine] deepResearch error:", error);
    return { success: false, error: "Keyword research failed. Please try again." };
  }
}

// ─── Related Keywords ────────────────────────────────────────────────

export async function getRelatedKeywords(
  keyword: string,
  category: string,
  marketplace: string = "Amazon India",
  seedKeywords?: string[],
  userId?: string
): Promise<RelatedKeyword[]> {
  if (!isAiAvailable()) return [];
  try {
    let prompt = "";
    if (seedKeywords && seedKeywords.length > 0) {
      prompt = `
        You are an elite Amazon Keyword Data Scientist.
        We have fetched the following 100% REAL Amazon autocomplete search queries typed by real buyers for the seed term "${keyword}":
        ${JSON.stringify(seedKeywords)}

        Your task is to enrich this list of real keywords with highly realistic Amazon metrics based on search trends in the category "${category}" on "${marketplace}".
        If there are fewer than 30 keywords, generate 10-15 additional "ai-suggested" keywords.

        Return ONLY a JSON array (no markdown):
        [
          {
            "keyword": "string",
            "type": "related" | "long-tail" | "synonym" | "broad" | "phrase" | "exact" | "misspelling" | "trending" | "ai-suggested",
            "searchVolume": number,
            "difficulty": number (0-100),
            "cpc": number (INR),
            "opportunityScore": number (0-100),
            "intent": "informational" | "commercial" | "transactional" | "navigational",
            "trend": "rising" | "stable" | "declining",
            "wordCount": number,
            "seasonality": "evergreen" | "seasonal" | "holiday",
            "competitorUsage": "common" | "rare" | "untapped"
          }
        ]
      `;
    } else {
      prompt = `
        You are an elite Amazon Keyword Data Scientist. Generate 35-45 related keywords for: "${keyword}" in category: ${category} on ${marketplace}.

        Include ALL types: related, long-tail, synonym, broad, phrase, exact, misspelling, trending, ai-suggested.

        Return ONLY a JSON array (no markdown):
        [
          {
            "keyword": "string",
            "type": "related" | "long-tail" | "synonym" | "broad" | "phrase" | "exact" | "misspelling" | "trending" | "ai-suggested",
            "searchVolume": number,
            "difficulty": number (0-100),
            "cpc": number (INR),
            "opportunityScore": number (0-100),
            "intent": "informational" | "commercial" | "transactional" | "navigational",
            "trend": "rising" | "stable" | "declining",
            "wordCount": number,
            "seasonality": "evergreen" | "seasonal" | "holiday",
            "competitorUsage": "common" | "rare" | "untapped"
          }
        ]
      `;
    }

    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return JSON.parse(cleanJsonResponse(text)) as RelatedKeyword[];
  } catch (error) {
    console.error("[KeywordEngine] getRelatedKeywords error:", error);
    throw new Error("Failed to get related keywords.");
  }
}

// ─── ASIN Analysis ───────────────────────────────────────────────────

export async function analyzeAsinKeywords(
  asin: string,
  category: string,
  marketplace: string = "Amazon India",
  productContext: string = "",
  userId?: string
): Promise<{ success: boolean; error?: string; data?: AsinKeywordProfile }> {
  if (!isAiAvailable()) return { success: false, error: "Gemini API key is not configured." };
  try {
    const contextBlock = productContext
      ? `ACTUAL PRODUCT DETAILS:\n${productContext}\n\nCRITICAL: Use this actual catalog info to generate realistic keyword rankings.`
      : `Based on your knowledge, infer what product this ASIN likely is.`;

    const prompt = `
      You are Amazon KW™ performing a competitor ASIN analysis for ASIN: ${asin} on ${marketplace}.
      ${contextBlock}

      Return ONLY a JSON object (no markdown):
      {
        "asin": "${asin}",
        "estimatedProduct": "string",
        "category": "${category}",
        "totalEstimatedTraffic": number,
        "keywords": [
          {
            "keyword": "string",
            "estimatedRank": number (1-50),
            "trafficShare": number (%),
            "isSponsored": boolean,
            "isOrganic": boolean,
            "searchVolume": number,
            "keywordValue": "string",
            "isGap": boolean,
            "difficulty": number (0-100),
            "intent": "informational" | "commercial" | "transactional" | "navigational"
          }
        ],
        "topTrafficKeywords": ["5 keywords"],
        "uniqueKeywords": ["keywords only this ASIN ranks for"],
        "gapOpportunities": ["high-value keywords to target"],
        "sharedKeywords": ["common category keywords"],
        "organicCount": number,
        "sponsoredCount": number,
        "aiSummary": "expert analysis string",
        "competitiveStrength": "weak" | "moderate" | "strong" | "dominant"
      }

      Generate 20-28 realistic keywords. trafficShare values should sum to ~100%.
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return { success: true, data: JSON.parse(cleanJsonResponse(text)) as AsinKeywordProfile };
  } catch (error) {
    console.error("[KeywordEngine] analyzeAsin error:", error);
    return { success: false, error: "ASIN analysis failed. Please try again." };
  }
}

// ─── Clustering & Insights ──────────────────────────────────────────

export async function clusterKeywordList(
  keywords: string[],
  productContext: string,
  userId?: string
): Promise<KeywordCluster[]> {
  if (!isAiAvailable()) return [];
  try {
    const prompt = `
      You are Amazon KW™ clustering engine. Group the following keywords into 5-8 strategic clusters for: ${productContext}

      Keywords: ${keywords.join(", ")}

      Use cluster types: primary, secondary, long-tail, buyer-intent, brand, seasonal, informational, high-conversion, low-competition.

      Return ONLY a JSON array (no markdown):
      [
        {
          "id": "string (slug)",
          "name": "string",
          "type": "primary" | "secondary" | "long-tail" | "buyer-intent" | "brand" | "seasonal" | "informational" | "high-conversion" | "low-competition",
          "keywords": ["keywords"],
          "avgVolume": number,
          "avgDifficulty": number (0-100),
          "opportunityLevel": "low" | "medium" | "high",
          "recommendedPlacement": ["title" | "bullets" | "description" | "backend" | "a-plus" | "ads"],
          "aiExplanation": "string",
          "color": "emerald | sky | amber | violet | pink | orange | teal | rose"
        }
      ]
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return JSON.parse(cleanJsonResponse(text)) as KeywordCluster[];
  } catch (error) {
    console.error("[KeywordEngine] clustering error:", error);
    throw new Error("Clustering failed.");
  }
}

export async function generateKwInsights(
  keyword: string,
  researchData: Partial<KWResearchReport>,
  relatedCount: number,
  competitorCount: number,
  userId?: string
): Promise<KWInsight[]> {
  if (!isAiAvailable()) return [];
  try {
    const prompt = `
      You are Amazon KW™ AI Insights engine. Generate 6-8 strategic insights for: "${keyword}"

      Context:
      - Monthly Volume: ${researchData.monthlySearchVolume}
      - Difficulty: ${researchData.difficultyScore}/100
      - Opportunity: ${researchData.opportunityScore}/100
      - Competition: ${researchData.competitionLevel}
      - Trend: ${researchData.trendDirection}
      - CPC: ₹${researchData.cpcEstimate}
      - Related keywords found: ${relatedCount}
      - Competitors analyzed: ${competitorCount}

      Mix types: opportunity, warning, tip, trend, competitor insights.

      Return ONLY a JSON array (no markdown):
      [
        {
          "id": "string",
          "type": "opportunity" | "warning" | "tip" | "competitor" | "trend",
          "headline": "string",
          "detail": "string (2-3 sentences)",
          "action": "string (specific next step)",
          "impact": "low" | "medium" | "high",
          "relatedKeywords": ["2-4 keywords"]
        }
      ]
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return JSON.parse(cleanJsonResponse(text)) as KWInsight[];
  } catch (error) {
    console.error("[KeywordEngine] insights error:", error);
    return [];
  }
}

export async function checkAsinKeywordRanks(
  asin: string,
  keywords: string[],
  category: string,
  marketplace: string = "Amazon India",
  productContext: string = "",
  userId?: string
): Promise<{ success: boolean; error?: string; data?: KeywordRankResult[] }> {
  if (!isAiAvailable()) return { success: false, error: "Gemini API key is not configured." };
  try {
    const contextBlock = productContext
      ? `ACTUAL PRODUCT DETAILS:\n${productContext}\n\nUse this to estimate realistic rankings.`
      : `Based on your knowledge, estimate rankings for this ASIN.`;

    const prompt = `
      You are Amazon KW™ Rank Tracker checking ranks for ASIN: ${asin} on ${marketplace}.
      ${contextBlock}

      Keywords to check: ${keywords.join(", ")}

      Return ONLY a JSON array (no markdown):
      [
        {
          "keyword": "string",
          "organicRank": number (1-50) | "50+",
          "sponsoredRank": number (1-20) | "none",
          "searchVolume": number,
          "difficulty": number (0-100),
          "rankingStatus": "dominant" | "page-1" | "page-2" | "not-ranking",
          "recommendation": "1 actionable recommendation"
        }
      ]
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return { success: true, data: JSON.parse(cleanJsonResponse(text)) as KeywordRankResult[] };
  } catch (error) {
    console.error("[KeywordEngine] rankCheck error:", error);
    return { success: false, error: "Keyword rank check failed. Please try again." };
  }
}
