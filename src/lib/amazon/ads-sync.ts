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
  startDate: z.string().date(),
  endDate: z.string().date(),
  reportId: z.string().min(1).max(200).optional(),
  profileId: z.string().min(1).max(200).optional(),
  pollCount: z.number().int().min(0).max(30).default(0),
});

interface AdsReportStatus {
  status?: string;
  url?: string;
  failureReason?: string;
}

function adsEndpoint(region: string): string {
  const value = region.toLowerCase();
  if (value.includes("japan") || value.includes("australia") || value.includes("far east")) {
    return "https://advertising-api-fe.amazon.com";
  }
  if (
    value.includes("india") ||
    value.includes("europe") ||
    value.includes("united kingdom") ||
    value.includes("uae")
  ) {
    return "https://advertising-api-eu.amazon.com";
  }
  return "https://advertising-api.amazon.com";
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 30_000);
  return Math.min(500 * 2 ** attempt + Math.floor(Math.random() * 250), 10_000);
}

async function amazonFetch(url: string, init: RequestInit, attempts = 5): Promise<Response> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === attempts - 1) return response;
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
  }
  throw new Error("Amazon Ads request exhausted its retry policy.");
}

async function resolveProfileId(
  endpoint: string,
  clientId: string,
  accessToken: string,
  marketplaceId: string,
): Promise<string> {
  const response = await amazonFetch(`${endpoint}/v2/profiles`, {
    headers: {
      "Amazon-Advertising-API-ClientId": clientId,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Amazon Ads profiles could not be loaded (HTTP ${response.status}).`);
  }

  const profiles = (await response.json()) as Array<Record<string, unknown>>;
  const selected = profiles.find(
    (profile) =>
      String(profile.countryCode ?? "").toUpperCase() === "IN" ||
      String(profile.accountInfo && (profile.accountInfo as Record<string, unknown>).marketplaceStringId) === marketplaceId,
  ) ?? profiles.find((profile) => {
    const accountInfo = profile.accountInfo as Record<string, unknown> | undefined;
    return accountInfo?.type === "seller";
  }) ?? profiles[0];
  if (!selected?.profileId) {
    throw new Error("No eligible Amazon Ads seller profile was found for this account.");
  }
  return String(selected.profileId);
}

function reportHeaders(clientId: string, accessToken: string, profileId: string) {
  return {
    "Amazon-Advertising-API-ClientId": clientId,
    "Amazon-Advertising-API-Scope": profileId,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function requestReport(
  endpoint: string,
  headers: Record<string, string>,
  startDate: string,
  endDate: string,
): Promise<string> {
  const response = await amazonFetch(`${endpoint}/reporting/reports`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `SellerPlus campaign performance ${startDate} to ${endDate}`,
      startDate,
      endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: [
          "date", "campaignId", "campaignName", "campaignStatus", "campaignBudgetAmount",
          "campaignBudgetType", "impressions", "clicks", "cost", "purchases30d", "sales30d",
        ],
        reportTypeId: "spCampaigns",
        timeUnit: "DAILY",
        format: "GZIP_JSON",
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Amazon Ads rejected the report request (HTTP ${response.status}).`);
  }
  const payload = (await response.json()) as { reportId?: unknown };
  if (typeof payload.reportId !== "string") {
    throw new Error("Amazon Ads did not return a report identifier.");
  }
  return payload.reportId;
}

async function downloadReport(url: string): Promise<Array<Record<string, unknown>>> {
  const parsed = new URL(url);
  const trustedHost =
    parsed.protocol === "https:" &&
    (parsed.hostname.endsWith(".amazonaws.com") || parsed.hostname.endsWith(".amazon.com"));
  if (!trustedHost || parsed.username || parsed.password) {
    throw new Error("Amazon returned an untrusted report download location.");
  }

  const response = await fetch(parsed, {
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Amazon Ads report download failed (HTTP ${response.status}).`);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 50 * 1024 * 1024) throw new Error("Amazon Ads report exceeds the 50 MB safety limit.");
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.byteLength > 50 * 1024 * 1024) throw new Error("Amazon Ads report exceeds the 50 MB safety limit.");
  const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  const payload = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!Array.isArray(payload)) throw new Error("Amazon Ads returned an invalid report document.");
  return payload.filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
}

function finiteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function persistCampaigns(
  ctx: JobContext,
  marketplaceAccountId: string,
  records: Array<Record<string, unknown>>,
  startDate: string,
  endDate: string,
  reportId: string,
  currencyCode: string,
): Promise<{ campaigns: number; dailyFacts: number }> {
  const now = new Date().toISOString();
  const dailyFacts = new Map<string, Record<string, unknown>>();
  const campaignTotals = new Map<string, Record<string, unknown>>();

  for (const record of records) {
    const campaignId = String(record.campaignId ?? "").trim();
    if (!campaignId) continue;
    const performanceDate = String(record.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(performanceDate) || performanceDate < startDate || performanceDate > endDate) {
      throw new Error("Amazon Ads returned a row without a valid in-range reporting date.");
    }
    const impressions = Math.max(0, Math.trunc(finiteNumber(record.impressions)));
    const clicks = Math.max(0, Math.trunc(finiteNumber(record.clicks)));
    const spend = Math.max(0, finiteNumber(record.cost));
    const sales = Math.max(0, finiteNumber(record.sales30d));
    const orders = Math.max(0, Math.trunc(finiteNumber(record.purchases30d)));
    const campaignName = String(record.campaignName ?? "Unnamed campaign").slice(0, 500);
    const dailyKey = `${campaignId}:${performanceDate}`;
    const previousDaily = dailyFacts.get(dailyKey);
    dailyFacts.set(dailyKey, {
      workspace_id: ctx.workspaceId,
      marketplace_account_id: marketplaceAccountId,
      synced_by: ctx.userId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      performance_date: performanceDate,
      impressions: Number(previousDaily?.impressions ?? 0) + impressions,
      clicks: Number(previousDaily?.clicks ?? 0) + clicks,
      spend: Number(previousDaily?.spend ?? 0) + spend,
      attributed_sales: Number(previousDaily?.attributed_sales ?? 0) + sales,
      attributed_orders: Number(previousDaily?.attributed_orders ?? 0) + orders,
      currency_code: currencyCode,
      data_source: "amazon_ads_api_v3",
      source_report_id: reportId,
      synced_at: now,
      updated_at: now,
    });

    const previousCampaign = campaignTotals.get(campaignId);
    const nextImpressions = Number(previousCampaign?.impressions ?? 0) + impressions;
    const nextClicks = Number(previousCampaign?.clicks ?? 0) + clicks;
    const nextSpend = Number(previousCampaign?.spend ?? 0) + spend;
    campaignTotals.set(campaignId, {
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      marketplace_account_id: marketplaceAccountId,
      campaign_id: campaignId,
      name: campaignName,
      status: String(record.campaignStatus ?? "UNKNOWN").toUpperCase(),
      budget: Math.max(0, finiteNumber(record.campaignBudgetAmount)),
      bid_strategy: String(record.campaignBudgetType ?? "DAILY").slice(0, 100),
      impressions: nextImpressions,
      clicks: nextClicks,
      spend: nextSpend,
      sales: Number(previousCampaign?.sales ?? 0) + sales,
      orders: Number(previousCampaign?.orders ?? 0) + orders,
      clicks_through_rate: nextImpressions > 0 ? nextClicks / nextImpressions : 0,
      cost_per_click: nextClicks > 0 ? nextSpend / nextClicks : 0,
      data_source: "amazon_ads_api_v3",
      currency_code: currencyCode,
      report_start_date: startDate,
      report_end_date: endDate,
      synced_at: now,
      updated_at: now,
    });
  }

  const factRows = Array.from(dailyFacts.values());
  const campaignRows = Array.from(campaignTotals.values());

  for (let index = 0; index < factRows.length; index += 500) {
    const { error } = await ctx.supabaseAdmin
      .from("advertising_performance_daily")
      .upsert(factRows.slice(index, index + 500), {
        onConflict: "workspace_id,marketplace_account_id,campaign_id,performance_date",
      });
    if (error) throw error;
  }
  for (let index = 0; index < campaignRows.length; index += 500) {
    const { error } = await ctx.supabaseAdmin
      .from("advertising_campaigns")
      .upsert(campaignRows.slice(index, index + 500), {
        onConflict: "workspace_id,marketplace_account_id,campaign_id",
      });
    if (error) throw error;
  }
  return { campaigns: campaignRows.length, dailyFacts: factRows.length };
}

export async function runAmazonAdsSync(ctx: JobContext): Promise<JobHandlerResult> {
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
    "amazon_ads",
  );
  const accessToken = await exchangeLwaRefreshToken(credentials);
  const endpoint = adsEndpoint(account.region);
  const profileId =
    payload.profileId ??
    (typeof account.metadata.adsProfileId === "string" ? account.metadata.adsProfileId : undefined) ??
    (await resolveProfileId(endpoint, credentials.clientId, accessToken, account.marketplaceId));
  const headers = reportHeaders(credentials.clientId, accessToken, profileId);

  if (!payload.reportId) {
    const reportId = await requestReport(endpoint, headers, payload.startDate, payload.endDate);
    await ctx.supabaseAdmin
      .from("marketplace_accounts")
      .update({
        connection_metadata: { ...account.metadata, adsProfileId: profileId },
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", account.id);
    return {
      output: {},
      summary: "Amazon Ads report requested.",
      continuation: {
        payload: { ...payload, reportId, profileId, pollCount: 0 },
        delaySeconds: 20,
        progress: 15,
        summary: "Amazon is preparing the advertising report.",
      },
    };
  }

  const statusResponse = await amazonFetch(`${endpoint}/reporting/reports/${encodeURIComponent(payload.reportId)}`, {
    headers,
  });
  if (!statusResponse.ok) {
    throw new Error(`Amazon Ads report status failed (HTTP ${statusResponse.status}).`);
  }
  const report = (await statusResponse.json()) as AdsReportStatus;
  const status = String(report.status ?? "").toUpperCase();
  if (["PENDING", "PROCESSING", "IN_PROGRESS"].includes(status)) {
    if (payload.pollCount >= 30) throw new Error("Amazon Ads report did not finish within the allowed polling window.");
    return {
      output: {},
      summary: "Amazon Ads report is still processing.",
      continuation: {
        payload: { ...payload, profileId, pollCount: payload.pollCount + 1 },
        delaySeconds: Math.min(20 + payload.pollCount * 5, 60),
        progress: Math.min(85, 20 + payload.pollCount * 2),
        summary: "Waiting for Amazon Ads to finish the report.",
      },
    };
  }
  if (status !== "COMPLETED" || !report.url) {
    throw new Error(`Amazon Ads report failed${report.failureReason ? `: ${report.failureReason}` : "."}`);
  }

  const rows = await downloadReport(report.url);
  const configuredCurrency = typeof account.metadata.currencyCode === "string"
    ? account.metadata.currencyCode.toUpperCase().slice(0, 3)
    : account.marketplaceId === "A21TJRUUN4KGV" ? "INR" : "UNK";
  const imported = await persistCampaigns(
    ctx,
    account.id,
    rows,
    payload.startDate,
    payload.endDate,
    payload.reportId,
    configuredCurrency,
  );
  const now = new Date().toISOString();
  await Promise.all([
    ctx.supabaseAdmin.from("sync_checkpoints").upsert({
      workspace_id: ctx.workspaceId,
      marketplace_account_id: account.id,
      resource_type: "amazon_ads_campaign_performance",
      cursor: { from: payload.startDate, through: payload.endDate, reportId: payload.reportId },
      last_attempted_at: now,
      last_succeeded_at: now,
      next_run_at: new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString(),
      failure_count: 0,
      freshness_state: "fresh",
      last_error_code: null,
      last_error_message: null,
      updated_at: now,
    }, { onConflict: "workspace_id,marketplace_account_id,resource_type" }),
    ctx.supabaseAdmin.from("marketplace_accounts").update({
      status: "active",
      last_healthy_at: now,
      last_error_code: null,
      updated_at: now,
    }).eq("workspace_id", ctx.workspaceId).eq("id", account.id),
  ]);

  return {
    output: { importedCampaigns: imported.campaigns, importedDailyFacts: imported.dailyFacts, reportId: payload.reportId, startDate: payload.startDate, endDate: payload.endDate },
    summary: `Imported ${imported.dailyFacts} daily Amazon Ads facts across ${imported.campaigns} campaigns.`,
    affectedEntities: rows.map((row) => String(row.campaignId ?? "")).filter(Boolean),
  };
}
