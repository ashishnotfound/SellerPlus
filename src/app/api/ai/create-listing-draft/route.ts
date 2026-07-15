/**
 * POST /api/ai/create-listing-draft
 *
 * Enqueues a create_listing_draft job via the existing JobService/bi_jobs
 * pipeline rather than executing synchronously. This avoids blocking the
 * HTTP request for a ~30-second AI call.
 *
 * The actual generation runs in the bi-processor worker via JobRegistry.
 * The response returns the job ID — the client polls or receives a
 * real-time notification when the job completes.
 *
 * Body: {
 *   productName: string
 *   category?: string
 *   targetKeywords?: string[]
 *   uniqueSellingPoints?: string[]
 *   targetAudience?: string
 *   existingListingId?: string  // creates a new revision if provided
 * }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";
import { jobService } from "@/lib/jobs/job-service";
import { log } from "@/lib/logger";

const RequestSchema = z.object({
  productName: z.string().min(1, "Product name is required").max(200),
  category: z.string().max(100).optional(),
  targetKeywords: z.array(z.string().max(80)).max(20).optional(),
  uniqueSellingPoints: z.array(z.string().max(200)).max(10).optional(),
  targetAudience: z.string().max(200).optional(),
  existingListingId: z.string().uuid().optional(),
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

    const result = await jobService.enqueue({
      type: "create_listing_draft",
      payload: parsed.data as Record<string, unknown>,
      userId: user.userId,
      priority: 4,
      maxAttempts: 2,
    });

    log.info(`[CreateListingDraft] Enqueued job ${result.jobId}`, undefined, {
      userId: user.userId,
      productName: parsed.data.productName,
    });

    return NextResponse.json({ jobId: result.jobId, status: "queued", message: "Draft generation started." }, { status: 202 });
  } catch (err) {
    const { body, status } = authErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
