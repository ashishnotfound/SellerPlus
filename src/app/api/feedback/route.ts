import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse } from "@/lib/auth-middleware";

const feedbackSchema = z.object({
  category: z.enum(["product_feedback", "bug_report", "support_request"])
    .default("product_feedback"),
  message: z.string().trim().min(3).max(4_000),
  pagePath: z.string().trim().max(500).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    const input = feedbackSchema.parse(await request.json());
    const userAgent = request.headers.get("user-agent");

    const { data, error } = await actor.supabaseAdmin
      .from("feedback_submissions")
      .insert({
        workspace_id: actor.workspaceId,
        submitted_by: actor.userId,
        category: input.category,
        message: input.message,
        page_path: input.pagePath ?? null,
        client_metadata: {
          userAgent: userAgent?.slice(0, 500) ?? null,
          application: "sellerplus-web",
        },
      })
      .select("id, created_at")
      .single();

    if (error || !data) throw error ?? new Error("Feedback record was not created.");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid feedback." },
        { status: 400 },
      );
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
