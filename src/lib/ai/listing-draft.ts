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
import { z } from "zod";
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

const ListingDraftRequestSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).optional(),
  targetKeywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  competitorAsins: z.array(z.string().regex(/^[A-Z0-9]{10}$/)).max(20).optional(),
  uniqueSellingPoints: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  targetAudience: z.string().trim().max(200).optional(),
  existingListingId: z.string().uuid().optional(),
});

/**
 * Generate and persist a validated draft listing.
 *
 * @param userId - Authenticated user ID
 * @param rawPayload - Job payload from bi_jobs.payload (validated here)
 * @param supabaseAdmin - Service-role client
 */
export async function generateListingDraft(
  userId: string,
  workspaceId: string,
  rawPayload: Record<string, unknown>,
  supabaseAdmin: SupabaseClient
): Promise<ListingDraftResult> {
  const req: ListingDraftRequest = ListingDraftRequestSchema.parse(rawPayload);

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
      .select("draft_revision, title, description, bullet_points, backend_keywords, aplus_content, infographic_concepts, ai_image_prompts")
      .eq("id", req.existingListingId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (!existing) {
      throw new Error(`Listing ${req.existingListingId} not found or not owned by user.`);
    }

    revisionNumber = (existing.draft_revision ?? 0) + 1;
    const { error: updateError } = await supabaseAdmin
      .from("listings")
      .update({
        title: draft.title,
        description: draft.description,
        bullet_points: draft.bulletPoints,
        aplus_content: draft.apluscontent,
        backend_keywords: draft.backendKeywords,
        infographic_concepts: draft.infographicConcepts.map((c) => c.concept),
        ai_image_prompts: draft.aiImagePrompts,
        status: "draft",
        publication_state: "draft",
        draft_revision: revisionNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.existingListingId)
      .eq("workspace_id", workspaceId);

    if (updateError) throw new Error(`Failed to update listing: ${updateError.message}`);
    listingId = req.existingListingId;

    const { error: versionError } = await supabaseAdmin.from("listing_versions").insert({
      workspace_id: workspaceId,
      listing_id: listingId,
      title: existing.title,
      description: existing.description,
      bullet_points: existing.bullet_points,
      keywords: existing.backend_keywords,
      snapshot_data: {
        aplusContent: existing.aplus_content,
        infographicConcepts: existing.infographic_concepts,
        aiImagePrompts: existing.ai_image_prompts,
      },
      change_summary: "Snapshot before AI-generated draft revision",
      user_action: "AI draft",
      version_number: Math.max(1, revisionNumber - 1),
    });
    if (versionError) throw new Error(`Failed to version listing draft: ${versionError.message}`);
  } else {
    // ── Create new draft listing ──────────────────────────────────────────
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("listings")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        channel: "amazon",
        price: 0,
        title: draft.title,
        description: draft.description,
        bullet_points: draft.bulletPoints,
        aplus_content: draft.apluscontent,
        backend_keywords: draft.backendKeywords,
        infographic_concepts: draft.infographicConcepts.map((c) => c.concept),
        ai_image_prompts: draft.aiImagePrompts,
        status: "draft",
        publication_state: "draft",
        data_source: "ai_generated",
        draft_revision: 1,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to create draft listing: ${insertError?.message}`);
    }
    listingId = inserted.id as string;

    const { error: versionError } = await supabaseAdmin.from("listing_versions").insert({
      workspace_id: workspaceId,
      listing_id: listingId,
      title: draft.title,
      description: draft.description,
      bullet_points: draft.bulletPoints,
      keywords: draft.backendKeywords,
      snapshot_data: { ...snapshotRevision, seoRationale: draft.seoRationale },
      change_summary: "Initial AI-generated listing draft",
      user_action: "AI draft",
      version_number: 1,
    });
    if (versionError) throw new Error(`Failed to version listing draft: ${versionError.message}`);
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
export async function approveListingDraft(
  listingId: string,
  workspaceId: string,
  approvedByUserId: string,
  supabaseAdmin: SupabaseClient
): Promise<void> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("listings")
    .select("status, publication_state, draft_revision, title, description, bullet_points, backend_keywords")
    .eq("id", listingId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new Error(`Listing ${listingId} not found in this workspace.`);
  }

  if (existing.status !== "draft") {
    throw new Error(`Listing ${listingId} is not a draft (status: ${existing.status}).`);
  }

  const approvalRevision = {
    revision: (existing.draft_revision ?? 0) + 1,
    action: "approved_for_publish",
    approvedBy: approvedByUserId,
    approvedAt: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseAdmin
    .from("listings")
    .update({
      publication_state: "approved",
      approved_for_publish_at: approvalRevision.approvedAt,
      approved_for_publish_by: approvedByUserId,
      draft_revision: approvalRevision.revision,
      updated_at: approvalRevision.approvedAt,
    })
    .eq("id", listingId)
    .eq("workspace_id", workspaceId)
    .eq("publication_state", existing.publication_state);

  if (updateError) {
    throw new Error(`Failed to approve listing: ${updateError.message}`);
  }

  const { error: versionError } = await supabaseAdmin.from("listing_versions").insert({
    workspace_id: workspaceId,
    listing_id: listingId,
    title: existing.title,
    description: existing.description,
    bullet_points: existing.bullet_points,
    keywords: existing.backend_keywords,
    snapshot_data: approvalRevision,
    change_summary: "Approved for deterministic marketplace publishing",
    user_action: "Approve",
    version_number: approvalRevision.revision,
  });
  if (versionError) throw new Error(`Failed to record listing approval: ${versionError.message}`);

  log.info(`[ListingDraft] Approved listing ${listingId} (rev ${approvalRevision.revision})`, undefined, {
    listingId,
    workspaceId,
    approvedByUserId,
  });
}
