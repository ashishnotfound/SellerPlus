import { NextResponse } from "next/server";
import { authenticate, authErrorResponse } from "@/lib/auth-middleware";

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    const { data, error } = await actor.supabaseAdmin
      .from("marketplace_accounts")
      .select("id, platform, seller_account_id, region, marketplace_id, display_name, status, capabilities, authorization_expires_at, last_healthy_at, last_error_code, updated_at")
      .eq("workspace_id", actor.workspaceId)
      .neq("status", "revoked")
      .order("created_at", { ascending: true })
      .limit(25);
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
