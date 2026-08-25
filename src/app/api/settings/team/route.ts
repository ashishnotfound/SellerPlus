import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const addSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "member", "viewer", "ppc_manager", "catalog_manager", "operations", "finance"]),
}).strict();
const removeSchema = z.object({ membershipId: z.string().uuid() }).strict();

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "team.manage");
    const { data, error } = await actor.supabaseAdmin
      .from("workspace_members")
      .select("id, role, user_id, created_at, profiles(email, full_name)")
      .eq("workspace_id", actor.workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "team.manage");
    const input = addSchema.parse(await request.json());
    const { data: profile, error: profileError } = await actor.supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", input.email)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json({
        error: "No verified SellerPlus user has this email. Email invitation delivery is not configured; ask them to create an account first.",
        code: "USER_NOT_FOUND",
      }, { status: 404 });
    }

    const { data, error } = await actor.supabaseAdmin
      .from("workspace_members")
      .insert({ workspace_id: actor.workspaceId, user_id: profile.id, role: input.role })
      .select("id, role, user_id, created_at")
      .single();
    if (error?.code === "23505") {
      return NextResponse.json({ error: "This user already belongs to the workspace.", code: "ALREADY_MEMBER" }, { status: 409 });
    }
    if (error || !data) throw error ?? new Error("Membership was not created.");

    await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId,
      actor_type: "human",
      actor_id: actor.userId,
      action: "team.member_added",
      resource_type: "workspace_membership",
      resource_id: data.id,
      new_state: { userId: profile.id, role: input.role },
      source: "team_settings_api",
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid team member." }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "team.manage");
    const input = removeSchema.parse(await request.json());
    const { data: membership, error: readError } = await actor.supabaseAdmin
      .from("workspace_members")
      .select("id, user_id, role")
      .eq("workspace_id", actor.workspaceId)
      .eq("id", input.membershipId)
      .maybeSingle();
    if (readError) throw readError;
    if (!membership) return NextResponse.json({ error: "Membership not found." }, { status: 404 });
    if (membership.role === "owner" || membership.user_id === actor.userId) {
      return NextResponse.json({ error: "The workspace owner and your own membership cannot be removed here." }, { status: 409 });
    }

    const { error } = await actor.supabaseAdmin
      .from("workspace_members")
      .delete()
      .eq("workspace_id", actor.workspaceId)
      .eq("id", membership.id);
    if (error) throw error;
    await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId,
      actor_type: "human",
      actor_id: actor.userId,
      action: "team.member_removed",
      resource_type: "workspace_membership",
      resource_id: membership.id,
      previous_state: { userId: membership.user_id, role: membership.role },
      source: "team_settings_api",
    });
    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid membership ID." }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
