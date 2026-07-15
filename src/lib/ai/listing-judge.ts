/**
 * SellerPlus OS — AI Listing Judge
 * 
 * Amazon listing audit engine. Analyzes listing content via URL scraping
 * or pasted HTML and produces a comprehensive quality report with scores
 * across SEO, conversion, keywords, images, and competitiveness.
 */

"use server";

import {
  routeLLMRequest,
  isAiAvailable,
  cleanHtml,
  cleanJsonResponse,
  scrapeUrlText,
} from "./utils";
import { ProviderCapability } from "./types";

// ─── Types ───────────────────────────────────────────────────────────

export interface ListingJudgeReport {
  overallScore: number;
  scores: {
    seo: number;
    conversion: number;
    keywords: number;
    image: number;
    competitiveness: number;
  };
  titleAnalysis: {
    length: number;
    maxRecommended: number;
    keywordsFound: string[];
    keywordsMissing: string[];
    readabilityScore: number;
    issues: string[];
  };
  descriptionAnalysis: {
    conversionPotential: "low" | "medium" | "high";
    formattingQuality: "poor" | "adequate" | "excellent";
    missingInformation: string[];
    suggestions: string[];
  };
  bulletAnalysis: {
    count: number;
    benefitsVsFeatures: string;
    customerAppeal: "low" | "medium" | "high";
    seoQuality: "weak" | "moderate" | "strong";
    issues: string[];
  };
  imageAnalysis: {
    estimatedCount: number;
    recommendedCount: number;
    aspectRatioIssues: string[];
    missingTypes: string[];
  };
  strengths: string[];
  weaknesses: string[];
  actionSteps: string[];
  optimizationSuggestions: string[];
  extractedDetails: {
    title: string;
    price: string;
    bullets: string[];
    description: string;
  };
}

// ─── Listing Audit ───────────────────────────────────────────────────

export async function auditAmazonUrl(
  url: string,
  rawHtmlFallback?: string,
  userId?: string
): Promise<{ success: boolean; error?: string; report?: ListingJudgeReport }> {
  if (!isAiAvailable()) {
    return { success: false, error: "Gemini API key is not configured." };
  }

  let textToAnalyze = "";
  let extractedTitle = "";
  let extractedPrice = "";

  if (rawHtmlFallback && rawHtmlFallback.trim().length > 0) {
    textToAnalyze = cleanHtml(rawHtmlFallback);
  } else {
    const scrape = await scrapeUrlText(url);
    if (scrape.blocked) {
      return {
        success: false,
        error:
          "Amazon security systems blocked direct page crawling. Please copy the page content (Ctrl+A, Ctrl+C) or raw HTML, and paste it into the manual box below to analyze.",
      };
    }
    textToAnalyze = scrape.body;
    extractedTitle = scrape.title;
    extractedPrice = scrape.price;
  }

  try {
    const prompt = `
      You are an expert Amazon listing consultant with 10+ years of experience optimizing product listings for maximum conversions and search visibility. Analyze the following scraped Amazon listing text/HTML and produce a comprehensive professional audit report.
      
      Listing Text:
      ${textToAnalyze}

      Extract: Product Title, Price, Bullet Points, and Product Description. If any are missing, infer them from context.
      
      Score ALL categories on a 0-100 scale. Be precise and critical — avoid inflated scores.

      Return ONLY a JSON object matching this exact structure (no markdown wrapping):
      {
        "overallScore": number (0-100, weighted average of sub-scores),
        "scores": {
          "seo": number (0-100),
          "conversion": number (0-100),
          "keywords": number (0-100),
          "image": number (0-100),
          "competitiveness": number (0-100)
        },
        "titleAnalysis": {
          "length": number (character count of title),
          "maxRecommended": 200,
          "keywordsFound": ["keywords present in the title"],
          "keywordsMissing": ["high-value keywords that SHOULD be in the title"],
          "readabilityScore": number (0-100),
          "issues": ["specific title problems"]
        },
        "descriptionAnalysis": {
          "conversionPotential": "low" | "medium" | "high",
          "formattingQuality": "poor" | "adequate" | "excellent",
          "missingInformation": ["info buyers need but listing lacks"],
          "suggestions": ["specific description improvements"]
        },
        "bulletAnalysis": {
          "count": number,
          "benefitsVsFeatures": "string, e.g. '2 benefits, 3 features — aim for 80% benefits'",
          "customerAppeal": "low" | "medium" | "high",
          "seoQuality": "weak" | "moderate" | "strong",
          "issues": ["specific bullet point problems"]
        },
        "imageAnalysis": {
          "estimatedCount": number (inferred from listing text),
          "recommendedCount": 7,
          "aspectRatioIssues": ["any detected aspect ratio or quality issues"],
          "missingTypes": ["lifestyle shot", "infographic", "size chart", "comparison chart", "packaging shot"]
        },
        "strengths": ["what the listing does well — be specific"],
        "weaknesses": ["what is hurting performance — be specific"],
        "actionSteps": ["numbered, prioritized action items to improve the listing"],
        "optimizationSuggestions": ["advanced optimization tips"],
        "extractedDetails": {
          "title": "string (extracted or inferred product title)",
          "price": "string (extracted price, e.g. ₹1,499)",
          "bullets": ["extracted or inferred feature bullet points"],
          "description": "string (extracted description text)"
        }
      }
    `;

    const { text } = await routeLLMRequest(
      prompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    
    const report = JSON.parse(cleanJsonResponse(text)) as ListingJudgeReport;

    // Fill in scraped fields if Gemini missed them
    if (!report.extractedDetails.title && extractedTitle) {
      report.extractedDetails.title = extractedTitle;
    }
    if ((!report.extractedDetails.price || report.extractedDetails.price === "N/A") && extractedPrice) {
      report.extractedDetails.price = extractedPrice;
    }

    return { success: true, report };
  } catch (error) {
    console.error("[ListingJudge] Audit failed:", error);
    return { success: false, error: "Failed to compile the AI audit report. Please check the pasted content." };
  }
}
