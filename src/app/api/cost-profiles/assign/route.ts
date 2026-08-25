import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const requestSchema = z.object({
  listingIds: z.array(z.string().uuid()).min(1).max(100),
  profileId: z.string().uuid().nullable(),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.manage");
    const input = requestSchema.parse(await request.json());

    if (input.profileId) {
      const { data: profile, error } = await actor.supabaseAdmin.from("cost_profiles")
        .select("id").eq("workspace_id", actor.workspaceId).eq("id", input.profileId).maybeSingle();
      if (error) throw error;
      if (!profile) return NextResponse.json({ error: "Cost profile not found.", code: "NOT_FOUND" }, { status: 404 });
    }

    const { data: ownedListings, error: lookupError } = await actor.supabaseAdmin.from("listings")
      .select("id, cost_profile_id").eq("workspace_id", actor.workspaceId).in("id", input.listingIds);
    if (lookupError) throw lookupError;
    if ((ownedListings ?? []).length !== new Set(input.listingIds).size) {
      return NextResponse.json({ error: "One or more listings are outside this workspace.", code: "NOT_FOUND" }, { status: 404 });
    }

    const { error } = await actor.supabaseAdmin.from("listings")
      .update({ cost_profile_id: input.profileId, updated_at: new Date().toISOString() })
      .eq("workspace_id", actor.workspaceId).in("id", input.listingIds);
    if (error) throw error;
    const { error: auditError } = await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId,
      actor_type: "human",
      actor_id: actor.userId,
      action: "cost_profile.bulk_assigned",
      resource_type: "listing",
      resource_id: input.listingIds.join(","),
      previous_state: { listings: ownedListings },
      new_state: { profileId: input.profileId, listingIds: input.listingIds },
      source: "cost_configuration",
    });
    if (auditError) throw auditError;
    return NextResponse.json({ data: { updated: input.listingIds.length } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid cost assignment.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
