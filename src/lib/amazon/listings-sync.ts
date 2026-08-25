import { gunzipSync } from "node:zlib";
import { z } from "zod";
import type { JobContext, JobHandlerResult } from "@/lib/jobs/job-registry";
import {
  exchangeLwaRefreshToken,
  getAmazonMarketplaceAccount,
  readAmazonCredentialSet,
} from "@/lib/amazon/credentials";

const payloadSchema = z.object({
  marketplaceAccountId: z.string().uuid(),
  reportId: z.string().min(1).max(200).optional(),
  pollCount: z.number().int().min(0).max(60).default(0),
});

function endpoint(region: string): string {
  const normalized = region.toLowerCase();
  if (normalized.includes("north america")) return "https://sellingpartnerapi-na.amazon.com";
  if (normalized.includes("far east")) return "https://sellingpartnerapi-fe.amazon.com";
  return "https://sellingpartnerapi-eu.amazon.com";
}

async function spFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "x-amz-access-token": accessToken,
        Accept: "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === 4) return response;
    const retryAfter = Number(response.headers.get("retry-after") ?? Number.NaN);
    const delay = Number.isFinite(retryAfter)
      ? Math.min(retryAfter * 1_000, 30_000)
      : Math.min(750 * 2 ** attempt + Math.floor(Math.random() * 250), 12_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Amazon SP-API request exhausted its retry policy.");
}

function normalizeStatus(value: unknown): "active" | "inactive" | "suppressed" | "draft" {
  const status = String(value ?? "").toLowerCase();
  if (status.includes("active")) return "active";
  if (status.includes("suppress")) return "suppressed";
  if (status.includes("draft")) return "draft";
  return "inactive";
}

function parseTsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function downloadDocument(url: string, compression?: string): Promise<string> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !(parsed.hostname.endsWith(".amazonaws.com") || parsed.hostname.endsWith(".amazon.com"))
  ) {
    throw new Error("Amazon returned an untrusted listings report location.");
  }
  const response = await fetch(parsed, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`Amazon listings report download failed (HTTP ${response.status}).`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 75 * 1024 * 1024) throw new Error("Amazon listings report exceeds the 75 MB safety limit.");
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.byteLength > 75 * 1024 * 1024) throw new Error("Amazon listings report exceeds the 75 MB safety limit.");
  const decompressed = compression === "GZIP" || (raw[0] === 0x1f && raw[1] === 0x8b)
    ? gunzipSync(raw)
    : raw;
  return decompressed.toString("utf8");
}

async function persistListings(
  ctx: JobContext,
  marketplaceAccountId: string,
  marketplaceId: string,
  items: Array<Record<string, string>>,
): Promise<number> {
  const now = new Date().toISOString();
  const rows = items.flatMap((item) => {
    const sku = item["seller-sku"]?.trim();
    if (!sku) return [];
    const price = Number(item.price);
    const quantity = Number.parseInt(item.quantity || "0", 10);
    const fulfillment = (item["fulfillment-channel"] ?? "").toUpperCase();
    return [{
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      marketplace_account_id: marketplaceAccountId,
      channel: "amazon",
      sku: sku.slice(0, 500),
      asin: (item.asin1 || item.asin || "").slice(0, 20) || null,
      title: (item["item-name"] || "Untitled Amazon listing").slice(0, 1_000),
      description: item["item-description"]?.slice(0, 20_000) || null,
      price: Number.isFinite(price) && price >= 0 ? price : 0,
      available_qty: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
      status: normalizeStatus(item.status),
      fulfillment_channel: fulfillment.includes("AMAZON") ? "FBA" : "FBM",
      data_source: "amazon_sp_api_report",
      source_updated_at: now,
      updated_at: now,
      marketplace_id: marketplaceId,
    }];
  });

  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await ctx.supabaseAdmin.from("listings").upsert(
      rows.slice(index, index + 500),
      { onConflict: "workspace_id,marketplace_account_id,channel,sku" },
    );
    if (error) throw error;
  }
  return rows.length;
}

export async function runAmazonListingsSync(ctx: JobContext): Promise<JobHandlerResult> {
  const payload = payloadSchema.parse(ctx.payload);
  const account = await getAmazonMarketplaceAccount(
    ctx.supabaseAdmin,
    ctx.workspaceId,
    payload.marketplaceAccountId,
  );
  const credentials = await readAmazonCredentialSet(
    ctx.supabaseAdmin,
    ctx.workspaceId,
    account.id,
    "amazon_sp_api",
  );
  const accessToken = await exchangeLwaRefreshToken(credentials);
  const baseUrl = endpoint(account.region);

  if (!payload.reportId) {
    const response = await spFetch(`${baseUrl}/reports/2021-06-30/reports`, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportType: "GET_MERCHANT_LISTINGS_ALL_DATA",
        marketplaceIds: [account.marketplaceId],
      }),
    });
    if (!response.ok) throw new Error(`Amazon rejected the listings report request (HTTP ${response.status}).`);
    const result = (await response.json()) as { reportId?: unknown };
    if (typeof result.reportId !== "string") throw new Error("Amazon did not return a listings report identifier.");
    return {
      output: {},
      summary: "Amazon listings report requested.",
      continuation: {
        payload: { ...payload, reportId: result.reportId, pollCount: 0 },
        delaySeconds: 20,
        progress: 10,
        summary: "Amazon is preparing the listings report.",
      },
    };
  }

  const statusResponse = await spFetch(
    `${baseUrl}/reports/2021-06-30/reports/${encodeURIComponent(payload.reportId)}`,
    accessToken,
  );
  if (!statusResponse.ok) throw new Error(`Amazon listings report status failed (HTTP ${statusResponse.status}).`);
  const status = (await statusResponse.json()) as { processingStatus?: string; reportDocumentId?: string };
  if (["IN_QUEUE", "IN_PROGRESS"].includes(status.processingStatus ?? "")) {
    if (payload.pollCount >= 60) throw new Error("Amazon listings report exceeded the polling window.");
    return {
      output: {},
      summary: "Amazon listings report is still processing.",
      continuation: {
        payload: { ...payload, pollCount: payload.pollCount + 1 },
        delaySeconds: Math.min(20 + payload.pollCount * 5, 60),
        progress: Math.min(85, 15 + payload.pollCount),
        summary: "Waiting for Amazon to finish the listings report.",
      },
    };
  }
  if (status.processingStatus !== "DONE" || !status.reportDocumentId) {
    throw new Error(`Amazon listings report failed with status ${status.processingStatus ?? "UNKNOWN"}.`);
  }

  const documentResponse = await spFetch(
    `${baseUrl}/reports/2021-06-30/documents/${encodeURIComponent(status.reportDocumentId)}`,
    accessToken,
  );
  if (!documentResponse.ok) throw new Error(`Amazon listings document lookup failed (HTTP ${documentResponse.status}).`);
  const document = (await documentResponse.json()) as { url?: string; compressionAlgorithm?: string };
  if (!document.url) throw new Error("Amazon did not return a listings report download URL.");
  const items = parseTsv(await downloadDocument(document.url, document.compressionAlgorithm));
  const imported = await persistListings(ctx, account.id, account.marketplaceId, items);
  const now = new Date().toISOString();
  await ctx.supabaseAdmin.from("sync_checkpoints").upsert({
    workspace_id: ctx.workspaceId,
    marketplace_account_id: account.id,
    resource_type: "amazon_listings",
    cursor: { reportId: payload.reportId, reportDocumentId: status.reportDocumentId },
    last_attempted_at: now,
    last_succeeded_at: now,
    next_run_at: new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString(),
    failure_count: 0,
    freshness_state: "fresh",
    last_error_code: null,
    last_error_message: null,
    updated_at: now,
  }, { onConflict: "workspace_id,marketplace_account_id,resource_type" });

  return {
    output: { imported, reportId: payload.reportId },
    summary: `Imported ${imported} Amazon listings.`,
    affectedEntities: items.map((item) => item["seller-sku"]).filter(Boolean),
  };
}
