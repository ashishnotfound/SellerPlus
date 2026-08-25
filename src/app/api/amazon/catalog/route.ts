import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";
import {
  exchangeLwaRefreshToken,
  getAmazonMarketplaceAccount,
  readAmazonCredentialSet,
} from "@/lib/amazon/credentials";

const requestSchema = z.object({
  asin: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/),
  marketplaceAccountId: z.string().uuid().optional(),
}).strict();

function spApiEndpoint(region: string): string {
  const value = region.toLowerCase();
  if (value.includes("north america")) return "https://sellingpartnerapi-na.amazon.com";
  if (value.includes("far east")) return "https://sellingpartnerapi-fe.amazon.com";
  return "https://sellingpartnerapi-eu.amazon.com";
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "catalog.read");
    const input = requestSchema.parse(await request.json());
    const account = await getAmazonMarketplaceAccount(
      actor.supabaseAdmin,
      actor.workspaceId,
      input.marketplaceAccountId,
    );
    if (!account.capabilities.includes("selling_partner")) {
      return NextResponse.json({ error: "Amazon SP-API is not connected for this account.", code: "SP_API_NOT_CONNECTED" }, { status: 409 });
    }
    const credentials = await readAmazonCredentialSet(
      actor.supabaseAdmin,
      actor.workspaceId,
      account.id,
      "amazon_sp_api",
    );
    const accessToken = await exchangeLwaRefreshToken(credentials);
    const endpoint = spApiEndpoint(account.region);
    const url = new URL(`${endpoint}/catalog/2022-04-01/items/${encodeURIComponent(input.asin)}`);
    url.searchParams.set("marketplaceIds", account.marketplaceId);
    url.searchParams.set("includedData", "summaries,attributes,images,productTypes,salesRanks");
    const response = await fetch(url, {
      headers: { "x-amz-access-token": accessToken, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return NextResponse.json({
        error: response.status === 404
          ? "Amazon did not find this ASIN in the selected marketplace."
          : `Amazon Catalog Items API failed (HTTP ${response.status}).`,
        code: "AMAZON_CATALOG_ERROR",
      }, { status: response.status === 404 ? 404 : 502 });
    }

    const catalog = await response.json();
    const summary = catalog.summaries?.[0] ?? {};
    const attributes = catalog.attributes ?? {};
    const bulletPoints = Array.isArray(attributes.bullet_point)
      ? attributes.bullet_point.map((item: { value?: unknown }) => String(item.value ?? "")).filter(Boolean)
      : [];
    return NextResponse.json({
      data: {
        asin: catalog.asin ?? input.asin,
        title: summary.itemName ?? "",
        brand: summary.brandName ?? "",
        manufacturer: summary.manufacturerName ?? "",
        productType: summary.productType ?? catalog.productTypes?.[0]?.productType ?? "",
        imageUrl: summary.mainImage?.link ?? catalog.images?.[0]?.images?.[0]?.link ?? "",
        description: attributes.product_description?.[0]?.value ?? "",
        bulletPoints,
        category: summary.classifications?.[0]?.displayName ?? "",
        source: "amazon_sp_api_catalog_items_2022_04_01",
        marketplaceId: account.marketplaceId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "A valid 10-character ASIN is required.", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
