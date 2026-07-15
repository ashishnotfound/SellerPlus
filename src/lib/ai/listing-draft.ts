/**
 * SellerPlus OS — Draft Listing Generator Service
 *
 * Called exclusively by the JobRegistry's `create_listing_draft` handler.
 * Generates a complete, validated AI draft listing and saves it to the
 * `listings` table with status = 'draft'. Supports version history from
 * the first write — each publish creates a new revision, not a destructive update.
 *
 * NEVER publishes listings automatically.
 * Seller approval via the UI is always required.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { DraftListingOutputSchema, DraftListingOutput } from "./listing-draft-schema";
import { generateValidatedJson } from "./schema-validator";
import { log } from "@/lib/logger";

export interface ListingDraftRequest {
  productName: string;
  category?: string;
  targetKeywords?: string[];
  competitorAsins?: string[];
  uniqueSellingPoints?: string[];
  targetAudience?: string;
  existingListingId?: string; // If set, creates a new revision of an existing listing
}

export interface ListingDraftResult {
  listingId: string;
  title: string;
  revisionNumber: number;
}

/**
 * Generate and persist a validated draft listing.
 *
 * @param userId - Authenticated user ID
 * @param rawPayload - Job payload from bi_jobs.payload (validated here)
 * @param supabaseAdmin - Service-role client
 */
export async function generateListingDraft(
  userId: string,
  rawPayload: Record<string, unknown>,
  supabaseAdmin: SupabaseClient
): Promise<ListingDraftResult> {
  const req: ListingDraftRequest = {
    productName: (rawPayload.productName as string) || "Unnamed Product",
    category: rawPayload.category as string | undefined,
    targetKeywords: rawPayload.targetKeywords as string[] | undefined,
    competitorAsins: rawPayload.competitorAsins as string[] | undefined,
    uniqueSellingPoints: rawPayload.uniqueSellingPoints as string[] | undefined,
    targetAudience: rawPayload.targetAudience as string | undefined,
    existingListingId: rawPayload.existingListingId as string | undefined,
  };

  const systemPrompt = `
You are an Amazon listing optimisation specialist with deep expertise in SEO, conversion copywriting, and A+ Content.

Your task is to create a complete, production-ready Amazon product listing for:
Product Name: ${req.productName}
${req.category ? `Category: ${req.category}` : ""}
${req.targetKeywords?.length ? `Target Keywords: ${req.targetKeywords.join(", ")}` : ""}
${req.uniqueSellingPoints?.length ? `Unique Selling Points: ${req.uniqueSellingPoints.join(", ")}` : ""}
${req.targetAudience ? `Target Audience: ${req.targetAudience}` : ""}

Rules:
- Title must be under 200 characters and include primary keywords naturally.
- Bullets must each start with an ALL-CAPS keyword benefit (e.g. "WATERPROOF DESIGN — ...").
- Backend keywords must not repeat words already in the title or bullets.
- A+ Content blocks must be self-contained and visually describable.
- Infographic concepts must be specific enough for an image AI to generate useful assets.
- Image prompts must describe high-quality white-background Amazon product photography.
- Provide seoRationale explaining your positioning strategy.

You MUST output a valid JSON object matching the DraftListingOutputSchema exactly.
  `.trim();

  const startTime = Date.now();
  log.info(`[ListingDraft] Generating draft for "${req.productName}"`, undefined, { userId });

  const draft: DraftListingOutput = await generateValidatedJson<DraftListingOutput>(
    systemPrompt,
    DraftListingOutputSchema,
    { temperature: 0.4 },
    userId
  );

  const durationMs = Date.now() - startTime;
  log.info(`[ListingDraft] Draft generated in ${durationMs}ms`, undefined, {
    userId,
    title: draft.title,
    bullets: draft.bulletPoints.length,
    keywords: draft.backendKeywords.length,
  });

  // ── Build draft payload ───────────────────────────────────────────────────
  const snapshotRevision = {
    revision: 1,
    snapshot: draft,
    created_at: new Date().toISOString(),
    source: "ai_generated",
  };

  let listingId: string;
  let revisionNumber = 1;

  if (req.existingListingId) {
    // ── New revision of an existing listing ───────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from("listings")
      .select("draft_revision, draft_history")
      .eq("id", req.existingListingId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      throw new Error(`Listing ${req.existingListingId} not found or not owned by user.`);
    }

    revisionNumber = (existing.draft_revision ?? 0) + 1;
    const previousHistory = (existing.draft_history as object[]) ?? [];

    const { error: updateError } = await supabaseAdmin
      .from("listings")
      .update({
        title: draft.title,
        bullet_points: draft.bulletPoints,
        aplus_content: draft.apluscontent,
        backend_keywords: draft.backendKeywords,
        infographic_concepts: draft.infographicConcepts.map((c) => c.concept),
        ai_image_prompts: draft.aiImagePrompts,
        status: "draft",
        draft_revision: revisionNumber,
        draft_history: [
          ...previousHistory,
          { ...snapshotRevision, revision: revisionNumber },
        ],
      })
      .eq("id", req.existingListingId)
      .eq("user_id", userId);

    if (updateError) throw new Error(`Failed to update listing: ${updateError.message}`);
    listingId = req.existingListingId;
  } else {
    // ── Create new draft listing ──────────────────────────────────────────
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("listings")
      .insert({
        user_id: userId,
        title: draft.title,
        bullet_points: draft.bulletPoints,
        aplus_content: draft.apluscontent,
        backend_keywords: draft.backendKeywords,
        infographic_concepts: draft.infographicConcepts.map((c) => c.concept),
        ai_image_prompts: draft.aiImagePrompts,
        status: "draft",
        draft_revision: 1,
        draft_history: [snapshotRevision],
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to create draft listing: ${insertError?.message}`);
    }
    listingId = inserted.id as string;
  }

  return { listingId, title: draft.title, revisionNumber };
}

/**
 * Publish a draft listing. Creates a new revision snapshot of the
 * current content before marking it active — previous work is never destroyed.
 *
 * @param listingId - The draft listing to publish
 * @param publishedByUserId - The user performing the approval action
 * @param supabaseAdmin - Service-role client
 */
export async function publishListingDraft(
  listingId: string,
  publishedByUserId: string,
  supabaseAdmin: SupabaseClient
): Promise<void> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("listings")
    .select("status, draft_revision, draft_history, title, bullet_points, backend_keywords")
    .eq("id", listingId)
    .eq("user_id", publishedByUserId)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error(`Listing ${listingId} not found or unauthorized.`);
  }

  if (existing.status !== "draft") {
    throw new Error(`Listing ${listingId} is not a draft (status: ${existing.status}).`);
  }

  const publishRevision = {
    revision: (existing.draft_revision ?? 0) + 1,
    action: "published",
    published_by: publishedByUserId,
    published_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseAdmin
    .from("listings")
    .update({
      status: "active",
      published_at: new Date().toISOString(),
      published_by: publishedByUserId,
      draft_revision: publishRevision.revision,
      draft_history: [
        ...((existing.draft_history as object[]) ?? []),
        publishRevision,
      ],
    })
    .eq("id", listingId)
    .eq("user_id", publishedByUserId);

  if (updateError) {
    throw new Error(`Failed to publish listing: ${updateError.message}`);
  }

  log.info(`[ListingDraft] Published listing ${listingId} (rev ${publishRevision.revision})`, undefined, {
    listingId,
    publishedByUserId,
  });
}
