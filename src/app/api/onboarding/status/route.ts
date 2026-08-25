import { NextResponse } from "next/server";
import { authenticate, authErrorResponse } from "@/lib/auth-middleware";

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    const [costProfiles, commandUsage] = await Promise.all([
      actor.supabaseAdmin.from("cost_profiles")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", actor.workspaceId),
      actor.supabaseAdmin.from("ai_usage_records")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", actor.workspaceId)
        .eq("feature", "global_command_center")
        .in("status", ["succeeded", "cached"]),
    ]);
    const error = costProfiles.error ?? commandUsage.error;
    if (error) throw error;
    return NextResponse.json({
      data: {
        costProfileAdded: Number(costProfiles.count ?? 0) > 0,
        aiChatUsed: Number(commandUsage.count ?? 0) > 0,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
