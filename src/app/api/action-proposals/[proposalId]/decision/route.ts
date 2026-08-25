import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";

const paramsSchema = z.object({ proposalId: z.string().uuid() });
const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  version: z.number().int().positive(),
  reason: z.string().trim().max(1_000).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "reject" && !value.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A rejection reason is required.",
    });
  }
});

export async function POST(
  request: Request,
  context: { params: Promise<{ proposalId: string }> },
) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "approval.decide");
    const { proposalId } = paramsSchema.parse(await context.params);
    const decision = decisionSchema.parse(await request.json());

    const { data, error } = await actor.supabaseAdmin.rpc("decide_action_proposal", {
      p_workspace_id: actor.workspaceId,
      p_proposal_id: proposalId,
      p_actor_id: actor.userId,
      p_decision: decision.decision,
      p_expected_version: decision.version,
      p_reason: decision.reason ?? null,
    });

    if (error) {
      const conflict = error.code === "40001";
      const unsupported = error.code === "0A000";
      const notFound = error.code === "P0002";
      return NextResponse.json(
        {
          error: conflict
            ? "This proposal changed or was already decided. Refresh and review it again."
            : unsupported
              ? "This action has no registered deterministic executor and cannot be approved."
              : notFound
                ? "Action proposal not found."
                : "The decision could not be recorded.",
          code: conflict
            ? "PROPOSAL_CONFLICT"
            : unsupported
              ? "EXECUTOR_UNAVAILABLE"
              : notFound
                ? "NOT_FOUND"
                : "DECISION_FAILED",
        },
        { status: conflict ? 409 : notFound ? 404 : unsupported ? 422 : 500 },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid decision.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
