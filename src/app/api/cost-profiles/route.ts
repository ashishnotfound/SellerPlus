import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";

const money = z.number().finite().min(0).max(10_000_000);
const costs = z.object({
  printingCost: money,
  materialCost: money,
  packagingCost: money,
  shippingCost: money,
  laborCost: money,
  miscCost: money,
}).strict();
const createSchema = z.object({ name: z.string().trim().min(1).max(150), costs }).strict();
const updateSchema = createSchema.extend({ id: z.string().uuid(), version: z.number().int().positive() });
const deleteSchema = z.object({ id: z.string().uuid(), version: z.coerce.number().int().positive() });
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
});

const profileColumns = "id, name, printing_cost, material_cost, packaging_cost, shipping_cost, labor_cost, misc_cost, created_at, updated_at, version";

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.read");
    const url = new URL(request.url);
    const query = querySchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    const [profilesResult, listingsResult] = await Promise.all([
      actor.supabaseAdmin
        .from("cost_profiles")
        .select(profileColumns)
        .eq("workspace_id", actor.workspaceId)
        .order("created_at", { ascending: false })
        .limit(200),
      actor.supabaseAdmin
        .from("listings")
        .select("id, sku, asin, title, price, cost_profile_id, main_image", { count: "exact" })
        .eq("workspace_id", actor.workspaceId)
        .order("sku", { ascending: true })
        .range(from, to),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (listingsResult.error) throw listingsResult.error;

    return NextResponse.json({
      data: {
        profiles: profilesResult.data ?? [],
        listings: listingsResult.data ?? [],
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: listingsResult.count ?? 0,
        },
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.manage");
    const input = createSchema.parse(await request.json());
    const { data, error } = await actor.supabaseAdmin.from("cost_profiles").insert({
      workspace_id: actor.workspaceId,
      user_id: actor.userId,
      name: input.name,
      ...databaseCosts(input.costs),
    }).select(profileColumns).single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A cost profile with this name already exists.", code: "CONFLICT" }, { status: 409 });
      }
      throw error;
    }
    await audit(actor, "cost_profile.created", data.id, null, data);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.manage");
    const input = updateSchema.parse(await request.json());
    const { data: previous } = await actor.supabaseAdmin.from("cost_profiles")
      .select(profileColumns).eq("workspace_id", actor.workspaceId).eq("id", input.id).maybeSingle();
    if (!previous) return NextResponse.json({ error: "Cost profile not found.", code: "NOT_FOUND" }, { status: 404 });

    const { data, error } = await actor.supabaseAdmin.from("cost_profiles").update({
      name: input.name,
      ...databaseCosts(input.costs),
      updated_at: new Date().toISOString(),
      version: input.version + 1,
    }).eq("workspace_id", actor.workspaceId).eq("id", input.id).eq("version", input.version)
      .select(profileColumns).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Cost profile changed. Refresh and try again.", code: "CONFLICT" }, { status: 409 });
    await audit(actor, "cost_profile.updated", data.id, previous, data);
    return NextResponse.json({ data });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "finance.manage");
    const url = new URL(request.url);
    const input = deleteSchema.parse({ id: url.searchParams.get("id"), version: url.searchParams.get("version") });
    const { data, error } = await actor.supabaseAdmin.from("cost_profiles")
      .delete().eq("workspace_id", actor.workspaceId).eq("id", input.id).eq("version", input.version)
      .select(profileColumns).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Cost profile changed or no longer exists.", code: "CONFLICT" }, { status: 409 });
    await audit(actor, "cost_profile.deleted", data.id, data, null);
    return NextResponse.json({ data: { id: data.id } });
  } catch (error) {
    return handleError(error);
  }
}

function databaseCosts(value: z.infer<typeof costs>) {
  return {
    printing_cost: value.printingCost,
    material_cost: value.materialCost,
    packaging_cost: value.packagingCost,
    shipping_cost: value.shippingCost,
    labor_cost: value.laborCost,
    misc_cost: value.miscCost,
  };
}

async function audit(
  actor: Awaited<ReturnType<typeof authenticate>>,
  action: string,
  resourceId: string,
  previousState: unknown,
  newState: unknown,
) {
  const { error } = await actor.supabaseAdmin.from("audit_events").insert({
    workspace_id: actor.workspaceId,
    actor_type: "human",
    actor_id: actor.userId,
    action,
    resource_type: "cost_profile",
    resource_id: resourceId,
    previous_state: previousState,
    new_state: newState,
    source: "cost_configuration",
  });
  if (error) throw error;
}

function handleError(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid cost profile request.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const response = authErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}
