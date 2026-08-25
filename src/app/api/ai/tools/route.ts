import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import {
  compareCompetitors,
  generateCopyVariations,
  generateFullListing,
  generateProductFromDescription,
  optimizeCopy,
  rewriteWithCompetitorGap,
} from "@/lib/ai/copywriter";
import {
  analyzeAsinKeywords,
  checkAsinKeywordRanks,
  clusterKeywordList,
  deepResearchKeyword,
  generateKeywords,
  generateKeywordsFromAsin,
  generateKwInsights,
  getRelatedKeywords,
} from "@/lib/ai/keyword-engine";
import { auditAmazonUrl } from "@/lib/ai/listing-judge";
import { runWithAIRequestContext } from "@/lib/ai/request-context";
import { aiBudgetErrorResponse } from "@/lib/ai/budget";

export const maxDuration = 60;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().max(max).optional();
const marketplace = z.enum(["amazon", "flipkart", "meesho", "etsy", "shopify"]);
const section = z.enum(["title", "bullets", "description", "brand-story", "a-plus-content", "faq", "search-terms"]);
const tone = z.enum(["professional", "premium", "luxury", "friendly", "minimal", "conversion-focused"]);

const requestSchema = z.object({
  tool: z.enum([
    "copy.optimize", "copy.full_listing", "copy.variations", "copy.competitor_gap",
    "keyword.generate", "keyword.reverse_asin", "keyword.deep_research", "keyword.related",
    "keyword.asin_analysis", "keyword.cluster", "keyword.insights", "keyword.ranks",
    "listing.audit", "listing.generate", "listing.compare",
  ]),
  input: z.unknown(),
}).strict();

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 300_000) {
      return NextResponse.json({ error: "AI tool request is too large.", code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const actor = await authenticate(request);
    requirePermission(actor, "catalog.write");
    const body = requestSchema.parse(await request.json());
    const userId = actor.userId;
    const result = await runWithAIRequestContext(
      { userId: actor.userId, workspaceId: actor.workspaceId, feature: body.tool },
      async () => {
        let toolResult: unknown;

        switch (body.tool) {
      case "copy.optimize": {
        const input = z.object({ section, currentText: text(10_000), marketplace, instructions: z.string().max(2_000), tone }).parse(body.input);
        toolResult = await optimizeCopy(input.section, input.currentText, input.marketplace, input.instructions, input.tone, userId);
        break;
      }
      case "copy.full_listing": {
        const input = z.object({ productDescription: text(10_000), marketplace, tone }).parse(body.input);
        toolResult = await generateFullListing(input.productDescription, input.marketplace, input.tone, userId);
        break;
      }
      case "copy.variations": {
        const input = z.object({ section, currentText: text(10_000), marketplace, tone }).parse(body.input);
        toolResult = await generateCopyVariations(input.section, input.currentText, input.marketplace, input.tone, userId);
        break;
      }
      case "copy.competitor_gap": {
        const input = z.object({ yourCopy: text(10_000), competitorCopy: text(10_000), section, marketplace }).parse(body.input);
        toolResult = await rewriteWithCompetitorGap(input.yourCopy, input.competitorCopy, input.section, input.marketplace, userId);
        break;
      }
      case "keyword.generate": {
        const input = z.object({ productName: text(300), category: text(150), competitors: z.string().max(4_000) }).parse(body.input);
        toolResult = await generateKeywords(input.productName, input.category, input.competitors, userId);
        break;
      }
      case "keyword.reverse_asin": {
        const input = z.object({ asin: z.string().regex(/^[A-Z0-9]{10}$/), category: text(150) }).parse(body.input);
        toolResult = await generateKeywordsFromAsin(input.asin, input.category, userId);
        break;
      }
      case "keyword.deep_research": {
        const input = z.object({ keyword: text(150), marketplace: text(80) }).parse(body.input);
        toolResult = await deepResearchKeyword(input.keyword, input.marketplace, userId);
        break;
      }
      case "keyword.related": {
        const input = z.object({ keyword: text(150), category: text(150), marketplace: text(80), seedKeywords: z.array(text(150)).max(50).optional() }).parse(body.input);
        toolResult = await getRelatedKeywords(input.keyword, input.category, input.marketplace, input.seedKeywords, userId);
        break;
      }
      case "keyword.asin_analysis": {
        const input = z.object({ asin: z.string().regex(/^[A-Z0-9]{10}$/), category: text(150), marketplace: text(80), productContext: z.string().max(10_000) }).parse(body.input);
        toolResult = await analyzeAsinKeywords(input.asin, input.category, input.marketplace, input.productContext, userId);
        break;
      }
      case "keyword.cluster": {
        const input = z.object({ keywords: z.array(text(150)).min(1).max(200), productContext: text(2_000) }).parse(body.input);
        toolResult = await clusterKeywordList(input.keywords, input.productContext, userId);
        break;
      }
      case "keyword.insights": {
        const input = z.object({ keyword: text(150), researchData: z.record(z.unknown()), relatedCount: z.number().int().min(0), competitorCount: z.number().int().min(0) }).parse(body.input);
        toolResult = await generateKwInsights(input.keyword, input.researchData, input.relatedCount, input.competitorCount, userId);
        break;
      }
      case "keyword.ranks": {
        const input = z.object({ asin: z.string().regex(/^[A-Z0-9]{10}$/), keywords: z.array(text(150)).min(1).max(100), category: text(150), marketplace: text(80), productContext: z.string().max(10_000) }).parse(body.input);
        toolResult = await checkAsinKeywordRanks(input.asin, input.keywords, input.category, input.marketplace, input.productContext, userId);
        break;
      }
      case "listing.audit": {
        const input = z.object({ url: optionalText(2_000), rawHtmlFallback: optionalText(200_000) }).refine((value) => Boolean(value.url || value.rawHtmlFallback), "URL or listing content is required").parse(body.input);
        toolResult = await auditAmazonUrl(input.url ?? "", input.rawHtmlFallback, userId);
        break;
      }
      case "listing.generate": {
        const input = z.object({ details: z.object({ name: text(300), theme: z.string().max(300), size: z.string().max(200), material: z.string().max(300), targetAudience: z.string().max(500), artStyle: z.string().max(500), intendedUse: z.string().max(500), specialFeatures: z.string().max(2_000) }) }).parse(body.input);
        toolResult = await generateProductFromDescription(input.details, userId);
        break;
      }
      case "listing.compare": {
        const input = z.object({ urls: z.array(z.string().url().max(2_000)).max(5), rawSpecs: z.array(z.string().max(100_000)).max(5).optional() }).parse(body.input);
        toolResult = await compareCompetitors(input.urls, input.rawSpecs, userId);
        break;
      }
        }
        return toolResult;
      },
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid AI tool request.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const budget = aiBudgetErrorResponse(error);
    if (budget) return NextResponse.json({ error: budget.error, code: budget.code }, { status: budget.status });
    const auth = authErrorResponse(error);
    if (auth.status !== 500) return NextResponse.json(auth.body, { status: auth.status });
    return NextResponse.json({ error: "SellerPlus AI could not complete this request.", code: "AI_TOOL_FAILED" }, { status: 502 });
  }
}
