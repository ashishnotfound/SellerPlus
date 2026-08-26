import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, requirePermission } from "@/lib/auth-middleware";
import { sessionMutationResultSchema } from "@/lib/reyo-pack/contracts";
import { noStoreJson, reyoPackErrorResponse } from "@/lib/reyo-pack/http";

const paramsSchema = z.object({ sessionId: z.string().uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  try {
    const actor = await authenticate(request);
    const { sessionId } = paramsSchema.parse(await context.params);
    const { data: session, error: sessionError } = await actor.supabaseAdmin
      .from("reyo_pack_sessions")
      .select("id, mode, started_by")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) {
      return NextResponse.json({ error: "Packing session not found.", code: "NOT_FOUND" }, { status: 404 });
    }
    requirePermission(actor, session.mode === "PACKING" ? "reyo_pack.pack" : "reyo_pack.putaway");
    if (session.started_by !== actor.userId && !actor.permissions.includes("reyo_pack.admin")) {
      return NextResponse.json({
        error: "Only the session owner or a Reyo Pack administrator can end this session.",
        code: "FORBIDDEN",
      }, { status: 403 });
    }
    const { data, error } = await actor.supabaseAdmin.rpc("end_reyo_pack_session", {
      p_workspace_id: actor.workspaceId,
      p_actor_id: actor.userId,
      p_session_id: sessionId,
    });
    if (error) throw error;
    return noStoreJson({ data: sessionMutationResultSchema.parse(data) });
  } catch (error) {
    return reyoPackErrorResponse(error, "Invalid session completion request.");
  }
}
