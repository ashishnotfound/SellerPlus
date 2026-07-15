/**
 * SellerPlus OS — AI Copywriter
 * 
 * Generates optimized Amazon listing copy, competitor comparisons,
 * and product descriptions using AI. Routes requests through the centralized
 * AI Gateway supporting multi-model execution.
 */

import {
  routeLLMRequest,
  isAiAvailable,
  cleanJsonResponse,
  scrapeUrlText,
} from "./utils";
import { ProviderCapability } from "./types";

// ─── Types ───────────────────────────────────────────────────────────

export interface ProductGenerationResult {
  title: string;
  description: string;
  bullets: string[];
  searchTerms: string[];
  attributes: {
    material: string;
    finishType: string;
    theme: string;
    occasion: string;
    targetAudience: string;
    roomType: string;
    color: string;
    style: string;
  };
  highlights: string[];
  occasionSuggestions: string[];
  targetAudienceSuggestions: string[];
  styleThemeRecommendations: string[];
  materialSuggestions: string[];
  colorFinishRecommendations: string[];
  seoScore: number;
}

export interface CompetitorComparison {
  competitors: {
    url: string;
    title: string;
    price: string;
    seoStrength: number;
    bulletQuality: string;
    imageEvaluation: string;
    keywordsDensity: string;
    keyDifference: string;
  }[];
  verdict: string;
  opportunitySummary: string;
}

// ─── Product Generation ──────────────────────────────────────────────

export async function generateProductFromDescription(
  details: {
    name: string;
    theme: string;
    size: string;
    material: string;
    targetAudience: string;
    artStyle: string;
    intendedUse: string;
    specialFeatures: string;
  },
  userId?: string
): Promise<{ success: boolean; error?: string; data?: ProductGenerationResult }> {
  if (!isAiAvailable()) {
    return { success: false, error: "Gemini API key is not configured." };
  }

  try {
    const prompt = `
      You are an expert Amazon SEO consultant. Write a high-converting, search-optimized Amazon listing based on these parameters:
      - Product Name: ${details.name}
      - Theme/Character: ${details.theme}
      - Dimensions/Size: ${details.size}
      - Construction Material: ${details.material}
      - Intended Target Audience: ${details.targetAudience}
      - Design Style/Art: ${details.artStyle}
      - Practical Intended Use: ${details.intendedUse}
      - Core Features: ${details.specialFeatures}

      Optimize the generated content for Amazon algorithms (including high CTR and organic keyword ranking).
      Return ONLY a JSON object matching this exact structure:
      {
        "title": "string (optimized Amazon title, 150-200 characters containing brand name, primary keywords, and features)",
        "description": "string (optimized HTML formatted or rich product description)",
        "bullets": ["string (5 optimized feature bullet points incorporating keywords)"],
        "searchTerms": ["string (backend search terms, space/comma separated)"],
        "attributes": {
          "material": "string suggestion",
          "finishType": "string suggestion",
          "theme": "string suggestion",
          "occasion": "string suggestion",
          "targetAudience": "string suggestion",
          "roomType": "string suggestion",
          "color": "string suggestion",
          "style": "string suggestion"
        },
        "highlights": ["string product key highlights"],
        "occasionSuggestions": ["string occasion recommendations"],
        "targetAudienceSuggestions": ["string demographic suggestions"],
        "styleThemeRecommendations": ["string aesthetic recommendations"],
        "materialSuggestions": ["string material options"],
        "colorFinishRecommendations": ["string finish recommendations"],
        "seoScore": number (0 to 100)
      }
    `;

    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    const data = JSON.parse(cleanJsonResponse(text)) as ProductGenerationResult;

    return { success: true, data };
  } catch (error) {
    console.error("[Copywriter] Product generation failed:", error);
    return { success: false, error: "Failed to generate listing details from description." };
  }
}

// ─── Competitor Comparison ───────────────────────────────────────────

export async function compareCompetitors(
  urls: string[],
  rawSpecs?: string[],
  userId?: string
): Promise<{ success: boolean; error?: string; comparison?: CompetitorComparison }> {
  if (!isAiAvailable()) {
    return { success: false, error: "Gemini API key is not configured." };
  }

  let analysisPayload = "";
  if (rawSpecs && rawSpecs.length > 0) {
    analysisPayload = rawSpecs.map((spec, i) => `Competitor ${i + 1} Payload: ${spec}`).join("\n\n");
  } else {
    const scrapedList = await Promise.all(
      urls
        .filter((url) => url.trim().length > 0)
        .map(async (url) => {
          const data = await scrapeUrlText(url);
          return {
            url,
            title: data.title || "Competitor Product",
            body: data.body || "Unavailable due to blocker",
          };
        })
    );
    analysisPayload = JSON.stringify(scrapedList);
  }

  try {
    const prompt = `
      You are an expert e-commerce analyst. Compare the following competitor listings and output a comparative side-by-side marketing report.
      
      Competitors Context:
      ${analysisPayload}

      Generate a comparison report. If specific details are blocked, infer or estimate based on titles and available contexts.
      Return ONLY a JSON object conforming exactly to this schema:
      {
        "competitors": [
          {
            "url": "string (competitor url or identifier)",
            "title": "string (product title)",
            "price": "string (estimated price, e.g. ₹999 or N/A)",
            "seoStrength": number (0 to 100),
            "bulletQuality": "Weak" | "Moderate" | "Strong",
            "imageEvaluation": "string description",
            "keywordsDensity": "string details",
            "keyDifference": "string detail"
          }
        ],
        "verdict": "string (comprehensive listing optimization recommendations)",
        "opportunitySummary": "string (where we can beat them: e.g. title lengths, better images, missing keywords)"
      }
    `;

    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    const comparison = JSON.parse(cleanJsonResponse(text)) as CompetitorComparison;

    return { success: true, comparison };
  } catch (error) {
    console.error("[Copywriter] Competitor comparison failed:", error);
    return { success: false, error: "Failed to assemble the competitor comparison matrix." };
  }
}

// ─── Copy Types ──────────────────────────────────────────────────────

export type CopySection = "title" | "bullets" | "description" | "brand-story" | "a-plus-content" | "faq" | "search-terms";
export type CopyMarketplace = "amazon" | "flipkart" | "meesho" | "etsy" | "shopify";
export type CopyTone = "professional" | "premium" | "luxury" | "friendly" | "minimal" | "conversion-focused";

export interface FullListingResult {
  title: string;
  bullets: string[];
  description: string;
  brandStory: string;
  faq: { question: string; answer: string }[];
  searchTerms: string;
  seoScore: number;
}

export interface ListingRewriteResult {
  before: { title: string; bullets: string[]; description: string };
  after: {
    title: string;
    bullets: string[];
    description: string;
    seoScore: number;
    improvementSummary: string[];
  };
}

export interface ComplianceResult {
  passed: boolean;
  overallRisk: "low" | "medium" | "high";
  violations: {
    type: "error" | "warning" | "info";
    section: string;
    issue: string;
    focus?: string;
    fix: string;
  }[];
  prohibitedWords: string[];
  suggestions: string[];
}

export interface CopyVariation {
  angle: "feature" | "emotion" | "value";
  label: string;
  text: string;
  readabilityGrade: number;
}

// ─── Copy Optimization ──────────────────────────────────────────────

export async function optimizeCopy(
  section: CopySection,
  currentText: string,
  marketplace: CopyMarketplace,
  instructions: string,
  tone: CopyTone = "professional",
  userId?: string
): Promise<string> {
  if (!isAiAvailable()) {
    throw new Error("Gemini API key is not configured. Please add your API key in Settings.");
  }

  try {
    const prompt = `
      You are SellerPlus AI Copywriter, an expert high-converting listing optimizer.
      
      Optimize the following ${section} of a listing for the ${marketplace} marketplace.
      Writing tone: ${tone}
      
      Current Text:
      "${currentText}"

      User Instructions:
      "${instructions}"

      Apply marketplace-specific rules:
      - Amazon: SEO keyword integration, clean bullet formats, 200-char title cap, 5 bullet max.
      - Flipkart: Bold feature tags, direct bullet layouts, visual description mapping.
      - Meesho: Simple descriptions, high local-language and transliterated keyword density.
      - Etsy: Storytelling focus, artisan/handmade language, tag optimization, shop personality.
      - Shopify: Brand voice consistency, lifestyle appeal, conversion-optimized CTAs.

      Apply tone rules:
      - professional: Clear, authoritative, fact-driven
      - premium: Sophisticated, elevated language, exclusivity signals
      - luxury: Aspirational, sensory language, prestige positioning
      - friendly: Warm, approachable, conversational
      - minimal: Clean, concise, no filler words
      - conversion-focused: Urgency, social proof, benefit-heavy, CTA-driven

      Return ONLY the optimized text. No markdown, no code blocks.
    `;

    const { text } = await routeLLMRequest(prompt, userId);
    return text.trim();
  } catch (error) {
    console.error("[Copywriter] optimizeCopy error:", error);
    throw new Error("Failed to optimize copy. Please try again.");
  }
}

// ─── Full Listing Generation ─────────────────────────────────────────

export async function generateFullListing(
  productDescription: string,
  marketplace: CopyMarketplace,
  tone: CopyTone = "professional",
  userId?: string
): Promise<FullListingResult> {
  if (!isAiAvailable()) {
    throw new Error("Gemini API key is not configured. Please add your API key in Settings.");
  }

  try {
    const prompt = `
      You are SellerPlus AI Copywriter. Generate a COMPLETE, production-ready product listing.
      
      Product Description: "${productDescription}"
      Marketplace: ${marketplace}
      Tone: ${tone}

      Return ONLY a JSON object (no markdown wrapping):
      {
        "title": "SEO-optimized product title within marketplace limits",
        "bullets": ["5 benefit-first bullet points with keywords"],
        "description": "Compelling product description with trust signals",
        "brandStory": "Brand story connecting product to customer values",
        "faq": [{"question": "string", "answer": "string"}],
        "searchTerms": "comma-separated backend search terms",
        "seoScore": number (0-100)
      }
    `;

    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return JSON.parse(cleanJsonResponse(text)) as FullListingResult;
  } catch (error) {
    console.error("[Copywriter] generateFullListing error:", error);
    throw new Error("Failed to generate full listing. Please try again.");
  }
}

// ─── Listing Rewriter ────────────────────────────────────────────────

export async function rewriteListing(
  title: string,
  bullets: string,
  description: string,
  targetKeywords: string,
  userId?: string
): Promise<{ success: boolean; error?: string; data?: ListingRewriteResult }> {
  if (!isAiAvailable()) return { success: false, error: "Gemini API key is not configured." };
  try {
    const prompt = `
      You are an expert Amazon listing optimizer. Rewrite the following existing listing to dramatically improve SEO, conversion rates, and keyword coverage.

      Current Title: "${title}"
      Current Bullets: "${bullets}"
      Current Description: "${description}"
      Target Keywords to integrate: "${targetKeywords}"

      Return ONLY a JSON object:
      {
        "before": { "title": "original title", "bullets": ["original bullets"], "description": "original description" },
        "after": { "title": "rewritten title", "bullets": ["5 rewritten bullets"], "description": "rewritten description", "seoScore": number (0-100), "improvementSummary": ["specific improvements"] }
      }
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return { success: true, data: JSON.parse(cleanJsonResponse(text)) as ListingRewriteResult };
  } catch (error) {
    console.error("[Copywriter] rewriteListing error:", error);
    return { success: false, error: "Failed to rewrite listing. Please try again." };
  }
}

// ─── Compliance Checker ──────────────────────────────────────────────

export async function checkCompliance(
  title: string,
  bullets: string,
  description: string,
  userId?: string
): Promise<{ success: boolean; error?: string; result?: ComplianceResult }> {
  if (!isAiAvailable()) return { success: false, error: "Gemini API key is not configured." };
  try {
    const prompt = `
      You are an Amazon listing compliance expert. Check the following listing content against Amazon's Seller Central listing policies.

      Title: "${title}"
      Bullets: "${bullets}"
      Description: "${description}"

      Check for: prohibited words, restricted claims, HTML in bullets/title, title >200 chars, all-caps, keyword stuffing, missing fields.

      Return ONLY a JSON object:
      {
        "passed": boolean,
        "overallRisk": "low" | "medium" | "high",
        "violations": [{ "type": "error" | "warning" | "info", "section": "title" | "bullets" | "description", "issue": "string", "fix": "string" }],
        "prohibitedWords": ["found prohibited words"],
        "suggestions": ["compliance tips"]
      }
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return { success: true, result: JSON.parse(cleanJsonResponse(text)) as ComplianceResult };
  } catch (error) {
    console.error("[Copywriter] checkCompliance error:", error);
    return { success: false, error: "Compliance check failed." };
  }
}

// ─── Copy Variations ─────────────────────────────────────────────────

export async function generateCopyVariations(
  section: CopySection,
  currentText: string,
  marketplace: CopyMarketplace,
  tone: CopyTone,
  userId?: string
): Promise<CopyVariation[]> {
  if (!isAiAvailable()) throw new Error("Gemini API key is not configured.");
  try {
    const prompt = `
      You are SellerPlus AI Copywriter. Generate 3 distinct copywriting variations of the following ${section} for ${marketplace}.

      Original text: "${currentText}"
      Tone: ${tone}

      Variation 1 — Feature angle: Technical, spec-driven.
      Variation 2 — Emotion angle: Lifestyle, aspirational.
      Variation 3 — Value angle: Price/value proposition.

      Return ONLY a JSON array:
      [
        { "angle": "feature" | "emotion" | "value", "label": "short label", "text": "variation copy", "readabilityGrade": number }
      ]
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return JSON.parse(cleanJsonResponse(text)) as CopyVariation[];
  } catch (error) {
    console.error("[Copywriter] generateCopyVariations error:", error);
    throw new Error("Failed to generate copy variations.");
  }
}

// ─── Competitor Gap Rewriter ─────────────────────────────────────────

export async function rewriteWithCompetitorGap(
  yourCopy: string,
  competitorCopy: string,
  section: CopySection,
  marketplace: CopyMarketplace,
  userId?: string
): Promise<{ rewritten: string; gapAnalysis: string[]; improvements: string[] }> {
  if (!isAiAvailable()) throw new Error("Gemini API key is not configured.");
  try {
    const prompt = `
      You are an expert Amazon competitive copywriter. Compare the seller's current copy with competitor's copy (${section}), identify gaps, then rewrite to outperform.

      Marketplace: ${marketplace}
      YOUR copy: "${yourCopy}"
      COMPETITOR copy: "${competitorCopy}"

      Return ONLY a JSON object:
      {
        "rewritten": "improved copy",
        "gapAnalysis": ["competitor has X that you're missing"],
        "improvements": ["specific improvement made"]
      }
    `;
    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    return JSON.parse(cleanJsonResponse(text));
  } catch (error) {
    console.error("[Copywriter] rewriteWithCompetitorGap error:", error);
    throw new Error("Competitor gap rewrite failed.");
  }
}
