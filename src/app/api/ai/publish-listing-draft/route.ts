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
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";
import { publishListingDraft } from "@/lib/ai/listing-draft";
import { log } from "@/lib/logger";

const RequestSchema = z.object({
  listingId: z.string().uuid("Invalid Listing UUID"),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await authenticateWithDevFallback(request);

    const rawBody = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { listingId } = parsed.data;

    // Call service layer to archive historical version and set active
    await publishListingDraft(listingId, user.userId, user.supabaseAdmin);

    log.info(`[PublishListingDraft] Published listing ${listingId}`, undefined, {
      userId: user.userId,
      listingId,
    });

    return NextResponse.json({ success: true, message: "Listing published successfully." });
  } catch (err: any) {
    const { body, status } = authErrorResponse(err);
    if (status !== 500) {
      return NextResponse.json(body, { status });
    }
    log.error("[PublishListingDraft] Exception:", undefined, { error: err.message });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
