/**
 * SellerPlus OS — Draft Listing Zod Schema
 *
 * Strongly-typed, validated output structure for AI-generated listing drafts.
 * The LLM is constrained to produce exactly this shape via schema-validator.
 * Downstream code (API route, listings page) always receives a verified object.
 */

import { z } from "zod";

// ─── A+ Content Block ─────────────────────────────────────────────────────────

const APlusBlockSchema = z.object({
  moduleType: z.enum([
    "header_image",
    "standard_text",
    "comparison_chart",
    "four_image_text",
    "technical_specs",
    "brand_story",
  ]),
  headline: z.string().max(200),
  body: z.string().max(1000),
  imagePrompt: z.string().max(400).optional().describe("Visual brief for the module image"),
});

// ─── Infographic Concept ──────────────────────────────────────────────────────

const InfographicConceptSchema = z.object({
  panelNumber: z.number().int().min(1).max(9),
  concept: z.string().max(200).describe("Short description of the infographic panel"),
  imagePrompt: z.string().max(400).describe("Detailed image generation prompt for this panel"),
  headline: z.string().max(80),
});

// ─── Full Draft Listing Output ────────────────────────────────────────────────

export const DraftListingOutputSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(200)
    .describe("SEO-optimised product title following Amazon character guidelines"),
  bulletPoints: z
    .array(z.string().max(500))
    .min(3)
    .max(5)
    .describe("Exactly 3–5 benefit-driven bullet points starting with all-caps keywords"),
  description: z
    .string()
    .max(2000)
    .describe("Full HTML-formatted product description optimised for conversion"),
  backendKeywords: z
    .array(z.string().max(100))
    .min(5)
    .max(20)
    .describe("Backend search terms — no repetition from title/bullets"),
  apluscontent: z
    .array(APlusBlockSchema)
    .min(1)
    .max(6)
    .describe("A+ Content module plan with headline, body, and image prompts"),
  infographicConcepts: z
    .array(InfographicConceptSchema)
    .min(3)
    .max(7)
    .describe("Infographic panel concepts with AI image prompts"),
  aiImagePrompts: z
    .array(z.string().max(600))
    .min(1)
    .max(4)
    .describe("Direct-to-AI image generation prompts for main and secondary listing images"),
  seoRationale: z
    .string()
    .max(800)
    .describe("AI explanation of the keyword and positioning strategy used"),
});

export type DraftListingOutput = z.infer<typeof DraftListingOutputSchema>;
