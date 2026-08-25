/**
 * POST /api/ai/publish-listing-draft
 *
 * Authenticated endpoint for publishing a draft listing.
 * Snapshot and marks status as active.
 *
 * Body: {
 *   listingId: string
 * }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { approveListingDraft } from "@/lib/ai/listing-draft";
import { log } from "@/lib/logger";

const RequestSchema = z.object({
  listingId: z.string().uuid("Invalid Listing UUID"),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await authenticate(request);
    requirePermission(user, "listing.publish");

    const rawBody = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { listingId } = parsed.data;

    // Approval is recorded locally. Marketplace submission requires a separate
    // deterministic Listings Items/Feeds executor and must never be faked.
    await approveListingDraft(listingId, user.workspaceId, user.userId, user.supabaseAdmin);

    log.info(`[PublishListingDraft] Approved listing ${listingId}`, undefined, {
      userId: user.userId,
      workspaceId: user.workspaceId,
      listingId,
    });

    return NextResponse.json({
      success: true,
      publicationState: "approved",
      message: "Listing approved for publishing. No marketplace change has been submitted yet.",
    });
  } catch (err: any) {
    const { body, status } = authErrorResponse(err);
    if (status !== 500) {
      return NextResponse.json(body, { status });
    }
    log.error("[PublishListingDraft] Exception:", undefined, { error: err.message });
    return NextResponse.json({ error: "The listing could not be approved for publishing." }, { status: 500 });
  }
}
