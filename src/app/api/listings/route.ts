import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const nullableText = z.string().trim().max(10_000).nullable();
const optionalTextArray = z.array(z.string().trim().min(1).max(500)).max(100);
const editableFieldsSchema = z.object({
  channel: z.enum(["amazon", "flipkart", "meesho", "shopify"]).optional(),
  status: z.enum(["active", "inactive", "draft", "suppressed"]).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: nullableText.optional(),
  sku: z.string().trim().min(1).max(100).optional(),
  asin: z.string().trim().max(20).nullable().optional(),
  fnsku: z.string().trim().max(100).nullable().optional(),
  parent_asin: z.string().trim().max(20).nullable().optional(),
  brand: z.string().trim().max(200).nullable().optional(),
  manufacturer: z.string().trim().max(200).nullable().optional(),
  product_type: z.string().trim().max(200).nullable().optional(),
  bullet_points: optionalTextArray.optional(),
  aplus_content: z.record(z.unknown()).optional(),
  backend_keywords: optionalTextArray.optional(),
  search_terms: optionalTextArray.optional(),
  subject_matter: nullableText.optional(),
  target_audience: nullableText.optional(),
  main_image: z.string().url().max(2_000).nullable().optional(),
  gallery_images: z.array(z.string().url().max(2_000)).max(20).optional(),
  alt_images: z.array(z.string().url().max(2_000)).max(20).optional(),
  color: z.string().trim().max(100).nullable().optional(),
  size: z.string().trim().max(100).nullable().optional(),
  material: z.string().trim().max(500).nullable().optional(),
  dimensions: z.string().trim().max(500).nullable().optional(),
  weight: z.string().trim().max(100).nullable().optional(),
  package_info: nullableText.optional(),
  country_of_origin: z.string().trim().max(100).nullable().optional(),
  price: z.number().finite().min(0).max(100_000_000).optional(),
  sale_price: z.number().finite().min(0).max(100_000_000).nullable().optional(),
  business_price: z.number().finite().min(0).max(100_000_000).nullable().optional(),
  available_qty: z.number().int().min(0).max(100_000_000).optional(),
  reserved_qty: z.number().int().min(0).max(100_000_000).optional(),
  incoming_qty: z.number().int().min(0).max(100_000_000).optional(),
  reorder_qty: z.number().int().min(0).max(100_000_000).optional(),
  fulfillment_channel: z.enum(["FBA", "FBM"]).optional(),
  shipping_settings: z.record(z.unknown()).optional(),
  package_settings: z.record(z.unknown()).optional(),
  performance_category: z.string().trim().max(50).nullable().optional(),
  performance_custom_thresholds: z.record(z.number().finite()).optional(),
  price_history: z.array(z.object({ date: z.string().max(40), price: z.number().finite().min(0) })).max(1_000).optional(),
}).strict();

const createSchema = editableFieldsSchema.required({ channel: true, title: true, sku: true, price: true }).extend({
  status: z.literal("draft").default("draft"),
}).strict();
const updateSchema = z.object({
  id: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  fields: editableFieldsSchema.refine((value) => Object.keys(value).length > 0, "At least one field is required."),
  changeSummary: z.string().trim().min(3).max(500),
}).strict();
const deleteSchema = z.object({ id: z.string().uuid(), expectedVersion: z.number().int().positive() }).strict();
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  status: z.enum(["active", "inactive", "draft", "suppressed"]).optional(),
  performance: z.enum(["winner", "trending", "profitable", "declining", "dead", "low_stock", "out_of_stock"]).optional(),
  search: z.string().trim().max(100).optional(),
});

const versionSelect = "id, listing_id, title, description, bullet_points, keywords, version_number, change_summary, user_action, created_at, snapshot_data";

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "catalog.read");
    const url = new URL(request.url);
    const input = querySchema.parse(Object.fromEntries(url.searchParams));
    const start = (input.page - 1) * input.pageSize;
    const end = start + input.pageSize - 1;

    let query = actor.supabaseAdmin
      .from("listings")
      .select("*", { count: "exact" })
      .eq("workspace_id", actor.workspaceId);
    if (input.status) query = query.eq("status", input.status);
    if (input.performance === "out_of_stock") query = query.eq("available_qty", 0);
    else if (input.performance) query = query.eq("performance_category", input.performance);
    if (input.search) {
      const safeSearch = input.search.replace(/[,%()*.\\]/g, " ").trim();
      if (safeSearch) query = query.or(`sku.ilike.%${safeSearch}%,asin.ilike.%${safeSearch}%,title.ilike.%${safeSearch}%`);
    }
    const [{ data: listings, count, error }, { data: counts, error: countsError }] = await Promise.all([
      query.order("updated_at", { ascending: false }).range(start, end),
      actor.supabaseAdmin.rpc("get_workspace_listing_counts", { p_workspace_id: actor.workspaceId }),
    ]);
    if (error || countsError) throw error ?? countsError;

    const ids = (listings ?? []).map((listing) => listing.id);
    const { data: versions, error: versionsError } = ids.length === 0
      ? { data: [], error: null }
      : await actor.supabaseAdmin
          .from("listing_versions")
          .select(versionSelect)
          .eq("workspace_id", actor.workspaceId)
          .in("listing_id", ids)
          .order("version_number", { ascending: false })
          .limit(Math.min(1_000, ids.length * 10));
    if (versionsError) throw versionsError;

    return NextResponse.json({
      data: listings ?? [],
      versions: versions ?? [],
      counts: counts ?? {},
      pagination: { page: input.page, pageSize: input.pageSize, total: count ?? 0 },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid listings query." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "catalog.write");
    const input = createSchema.parse(await request.json());
    const now = new Date().toISOString();
    const { data: listing, error } = await actor.supabaseAdmin.from("listings").insert({
      ...input,
      workspace_id: actor.workspaceId,
      user_id: actor.userId,
      data_source: "seller_entered",
      publication_state: "draft",
      sales_30d: null,
      revenue_30d: null,
      orders_30d: null,
      units_sold_30d: null,
      conversion_rate_30d: null,
      seo_score: null,
      updated_at: now,
      version: 1,
    }).select("*").single();
    if (error || !listing) throw error ?? new Error("Listing was not created.");

    const { data: createdVersion, error: versionError } = await actor.supabaseAdmin.from("listing_versions").insert({
      workspace_id: actor.workspaceId,
      listing_id: listing.id,
      title: listing.title,
      description: listing.description,
      bullet_points: listing.bullet_points ?? [],
      keywords: listing.backend_keywords ?? [],
      version_number: 1,
      change_summary: "Initial seller draft",
      user_action: "Merchant Creation",
      snapshot_data: listing,
    }).select(versionSelect).single();
    if (versionError) throw versionError;
    await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId, actor_type: "human", actor_id: actor.userId,
      action: "listing.created", resource_type: "listing", resource_id: listing.id,
      new_state: { sku: listing.sku, status: listing.status }, source: "listings_api",
    });
    return NextResponse.json({ data: listing, version: createdVersion }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid listing." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "catalog.write");
    const input = updateSchema.parse(await request.json());
    const { data: current, error: currentError } = await actor.supabaseAdmin
      .from("listings").select("*")
      .eq("workspace_id", actor.workspaceId).eq("id", input.id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    if (Number(current.version ?? 1) !== input.expectedVersion) {
      return NextResponse.json({ error: "The listing changed. Refresh before saving.", code: "VERSION_CONFLICT" }, { status: 409 });
    }
    if (current.data_source === "amazon_sp_api" && input.fields.status && input.fields.status !== current.status) {
      return NextResponse.json({ error: "Amazon listing state can only change through a registered Listings Items or Feeds executor." }, { status: 422 });
    }

    const nextVersion = input.expectedVersion + 1;
    const { data: updated, error } = await actor.supabaseAdmin.from("listings")
      .update({ ...input.fields, version: nextVersion, updated_at: new Date().toISOString() })
      .eq("workspace_id", actor.workspaceId).eq("id", input.id).eq("version", input.expectedVersion)
      .select("*").maybeSingle();
    if (error) throw error;
    if (!updated) return NextResponse.json({ error: "The listing changed. Refresh before saving.", code: "VERSION_CONFLICT" }, { status: 409 });

    const { data: latestVersion } = await actor.supabaseAdmin.from("listing_versions")
      .select("version_number").eq("workspace_id", actor.workspaceId).eq("listing_id", input.id)
      .order("version_number", { ascending: false }).limit(1).maybeSingle();
    const versionNumber = Number(latestVersion?.version_number ?? 0) + 1;
    const { data: createdVersion, error: versionError } = await actor.supabaseAdmin.from("listing_versions").insert({
      workspace_id: actor.workspaceId, listing_id: input.id, title: updated.title,
      description: updated.description, bullet_points: updated.bullet_points ?? [],
      keywords: updated.backend_keywords ?? [], version_number: versionNumber,
      change_summary: input.changeSummary, user_action: "Merchant Edit", snapshot_data: updated,
    }).select(versionSelect).single();
    if (versionError) throw versionError;
    await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId, actor_type: "human", actor_id: actor.userId,
      action: "listing.updated", resource_type: "listing", resource_id: input.id,
      previous_state: current, new_state: updated, source: "listings_api",
    });
    return NextResponse.json({ data: updated, version: createdVersion });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid listing update." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "catalog.write");
    const input = deleteSchema.parse(await request.json());
    const { data: listing, error } = await actor.supabaseAdmin.from("listings")
      .select("id, sku, title, status, publication_state, version")
      .eq("workspace_id", actor.workspaceId).eq("id", input.id).maybeSingle();
    if (error) throw error;
    if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    if (Number(listing.version ?? 1) !== input.expectedVersion) return NextResponse.json({ error: "The listing changed. Refresh before deleting." }, { status: 409 });

    const { data: proposal, error: proposalError } = await actor.supabaseAdmin.from("action_proposals").insert({
      workspace_id: actor.workspaceId, proposed_by: actor.userId, actor_type: "human",
      action_type: "delete_listing", resource_type: "listing", resource_id: listing.id,
      current_state: listing, proposed_state: { deleted: true },
      reasoning: "A user requested permanent listing deletion.", risk_level: "high",
      status: "approval_required", policy_snapshot: { explicitApprovalRequired: true },
    }).select("id").single();
    if (proposalError || !proposal) throw proposalError ?? new Error("Deletion proposal was not created.");
    return NextResponse.json({ data: { proposalId: proposal.id, approvalRequired: true } }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid delete request." }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
