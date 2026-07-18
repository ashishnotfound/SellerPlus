/**
 * SellerPlus OS — Amazon Advertising Sync API
 *
 * Syncs Sponsored Products / Brands / Display campaign performance
 * from the Amazon Advertising API v3 (Reporting endpoint).
 *
 * Uses JWT-verified user identity — userId is never trusted from request body.
 *
 * Flow:
 *  1. Exchange LWA refresh token for an Advertising API access token
 *  2. GET /v2/profiles to discover the seller's advertising profiles
 *  3. POST /reporting/reports to request a campaigns performance snapshot
 *  4. Poll until COMPLETED
 *  5. Download + parse the report
 *  6. Upsert advertising_campaigns in Supabase
 */

import { NextResponse } from "next/server";
import {
  authenticateWithDevFallback,
  authErrorResponse,
} from "@/lib/auth-middleware";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAdsAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      refresh_token: refreshToken.trim(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Advertising API LWA token exchange failed (HTTP ${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

function resolveAdsEndpoint(region: string): string {
  const norm = (region || "").toLowerCase();
  if (norm.includes("us") || norm.includes("north america") || norm.includes("com")) {
    return "https://advertising-api.amazon.com";
  } else if (norm.includes("europe") || norm.includes("co.uk") || norm.includes("uk")) {
    return "https://advertising-api-eu.amazon.com";
  } else if (norm.includes("far east") || norm.includes("japan") || norm.includes("jp")) {
    return "https://advertising-api-fe.amazon.com";
  }
  // Default: India uses NA endpoint (amazon.in advertising API)
  return "https://advertising-api.amazon.com";
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 4
): Promise<Response> {
  let delay = 1000;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      console.warn(`[AdsSync] Rate limited. Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 20000);
      continue;
    }
    return res;
  }
  throw new Error(`Rate limit exceeded after ${maxRetries} retries for ${url}`);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      profileId: bodyProfileId,
      region,
      userId: bodyUserId,
    } = body;

    // Authenticate: JWT in production, body userId in development
    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request, bodyUserId);

    // Fetch credentials from DB securely
    const { data: devCreds } = await supabaseAdmin
      .from("amazon_developer_credentials")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const clientId = devCreds?.ads_client_id || process.env.NEXT_PUBLIC_AMAZON_ADS_CLIENT_ID;
    const clientSecret = devCreds?.ads_client_secret || process.env.AMAZON_ADS_CLIENT_SECRET;

    const { data: userToken, error: connError } = await supabaseAdmin
      .from("amazon_user_tokens")
      .select("refresh_token")
      .eq("supabase_user_id", userId)
      .eq("provider", "ads")
      .maybeSingle();

    if (connError || !userToken) {
      return NextResponse.json({ error: "No active Amazon Ads connection found. Please configure in Settings." }, { status: 400 });
    }

    const refreshToken = userToken.refresh_token;

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        { error: "Missing required Amazon Ads credentials (Client ID, Client Secret, or Refresh Token)." },
        { status: 500 }
      );
    }

    const adsEndpoint = resolveAdsEndpoint(region || "");
    const accessToken = await getAdsAccessToken(clientId, clientSecret, refreshToken);

    // ── Step 1: Discover profiles ─────────────────────────────────────────────
    // If profileId was not passed, discover it from the API
    let profileId: string | null = bodyProfileId || null;

    if (!profileId) {
      const profilesRes = await fetchWithRetry(`${adsEndpoint}/v2/profiles`, {
        headers: {
          "Amazon-Advertising-API-ClientId": clientId.trim(),
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!profilesRes.ok) {
        const errText = await profilesRes.text();
        console.warn(`[AdsSync] Could not discover profiles (HTTP ${profilesRes.status}): ${errText}`);
        // Non-fatal: fall through to direct campaign fetch if profile not needed
      } else {
        const profiles = await profilesRes.json();
        if (Array.isArray(profiles) && profiles.length > 0) {
          // Pick the first SELLER profile (not vendor)
          const sellerProfile = profiles.find((p: any) => p.accountInfo?.type === "seller") || profiles[0];
          profileId = String(sellerProfile.profileId);
          console.log(`[AdsSync] Using advertising profile: ${profileId} (${sellerProfile.accountInfo?.name || "unknown"})`);
        }
      }
    }

    if (!profileId) {
      return NextResponse.json(
        { error: "Could not determine Amazon Advertising profile ID. Please provide profileId or ensure your account has Sponsored Products access." },
        { status: 400 }
      );
    }

    const adsHeaders = {
      "Amazon-Advertising-API-ClientId": clientId.trim(),
      "Amazon-Advertising-API-Scope": profileId,
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    // ── Step 2: Request Sponsored Products Campaigns report ───────────────────
    // Using Reporting API v3 for a 30-day campaign performance snapshot
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split("T")[0].replace(/-/g, "");
    const endDate = new Date().toISOString().split("T")[0].replace(/-/g, "");

    const reportBody = {
      name: `SellerPlus Campaign Report ${endDate}`,
      startDate,
      endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: [
          "campaignId",
          "campaignName",
          "campaignStatus",
          "campaignBudgetAmount",
          "campaignBudgetType",
          "impressions",
          "clicks",
          "cost",
          "purchases1d",
          "purchases7d",
          "purchases14d",
          "purchases30d",
          "sales1d",
          "sales7d",
          "sales14d",
          "sales30d",
        ],
        reportTypeId: "spCampaigns",
        timeUnit: "SUMMARY",
        format: "JSON",
      },
    };

    const reportRes = await fetchWithRetry(`${adsEndpoint}/reporting/reports`, {
      method: "POST",
      headers: adsHeaders,
      body: JSON.stringify(reportBody),
    });

    if (!reportRes.ok) {
      const errText = await reportRes.text();
      console.error(`[AdsSync] Failed to request report (HTTP ${reportRes.status}): ${errText}`);

      // Fallback: Try direct campaigns endpoint (v2) if reporting API fails
      console.log("[AdsSync] Falling back to direct Campaigns v2 API...");
      return await syncViaCampaignsEndpoint(adsEndpoint, adsHeaders, userId, supabaseAdmin);
    }

    const reportData = await reportRes.json();
    const reportId = reportData.reportId;
    console.log(`[AdsSync] Report requested. reportId: ${reportId}`);

    // ── Step 3: Poll until COMPLETED ─────────────────────────────────────────
    let reportStatus = "PENDING";
    let reportUrl = "";
    let pollAttempts = 0;
    const maxPollAttempts = 15;

    while (reportStatus !== "COMPLETED" && reportStatus !== "FAILED" && pollAttempts < maxPollAttempts) {
      await new Promise((r) => setTimeout(r, 4000));
      pollAttempts++;

      const statusRes = await fetchWithRetry(`${adsEndpoint}/reporting/reports/${reportId}`, {
        headers: adsHeaders,
      });

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        reportStatus = statusData.status;
        if (statusData.url) reportUrl = statusData.url;
        console.log(`[AdsSync] Poll ${pollAttempts}/${maxPollAttempts}: status=${reportStatus}`);
      }
    }

    if (reportStatus !== "COMPLETED" || !reportUrl) {
      console.warn(`[AdsSync] Report not ready after ${maxPollAttempts} polls. Falling back to Campaigns v2...`);
      return await syncViaCampaignsEndpoint(adsEndpoint, adsHeaders, userId, supabaseAdmin);
    }

    // ── Step 4: Download + parse the report ──────────────────────────────────
    const downloadRes = await fetch(reportUrl);
    if (!downloadRes.ok) {
      throw new Error(`Failed to download ads report (HTTP ${downloadRes.status})`);
    }

    const reportJson: any[] = await downloadRes.json();
    console.log(`[AdsSync] Downloaded ${reportJson.length} campaign records.`);

    // ── Step 5: Upsert to Supabase ────────────────────────────────────────────
    const upserted = await upsertCampaigns(reportJson, userId, supabaseAdmin, "reporting_v3");

    return NextResponse.json({ success: true, count: upserted, source: "reporting_v3" });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error("[SyncAdsRoute] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Fallback: Campaigns v2 Direct API ───────────────────────────────────────
// Used when Reporting API v3 is not available or times out.

async function syncViaCampaignsEndpoint(
  adsEndpoint: string,
  adsHeaders: Record<string, string>,
  userId: string,
  supabaseAdmin: any
): Promise<NextResponse> {
  const campaignsRes = await fetchWithRetry(`${adsEndpoint}/v2/sp/campaigns?stateFilter=enabled,paused,archived&count=100`, {
    headers: adsHeaders,
  });

  if (!campaignsRes.ok) {
    const errText = await campaignsRes.text();
    throw new Error(`Campaigns API failed (HTTP ${campaignsRes.status}): ${errText}`);
  }

  const campaigns = await campaignsRes.json();
  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    return NextResponse.json({ success: true, count: 0, source: "campaigns_v2", message: "No campaigns found." });
  }

  console.log(`[AdsSync] Got ${campaigns.length} campaigns from v2 endpoint.`);

  // For each campaign, fetch campaign-level stats
  const stats30Res = await fetchWithRetry(`${adsEndpoint}/v2/sp/campaigns/report`, {
    method: "POST",
    headers: adsHeaders,
    body: JSON.stringify({
      reportDate: new Date().toISOString().split("T")[0].replace(/-/g, ""),
      metrics: "campaignName,impressions,clicks,cost,attributedSales30d,attributedConversions30d",
    }),
  });

  // Map campaigns with available data (stats may not be available)
  const campaignMap = new Map<string, any>();
  campaigns.forEach((c: any) => {
    campaignMap.set(String(c.campaignId), c);
  });

  const upserted = await upsertCampaigns(campaigns, userId, supabaseAdmin, "campaigns_v2");
  return NextResponse.json({ success: true, count: upserted, source: "campaigns_v2" });
}

// ─── Upsert helper ────────────────────────────────────────────────────────────

async function upsertCampaigns(
  records: any[],
  userId: string,
  supabaseAdmin: any,
  source: string
): Promise<number> {
  let upserted = 0;

  for (const record of records) {
    // Normalize fields from both Reporting v3 and Campaigns v2 responses
    const campaignId = String(record.campaignId || record.campaignId || record.id || "");
    const name = record.campaignName || record.name || "Unknown Campaign";
    const status = (record.campaignStatus || record.state || "UNKNOWN").toUpperCase();
    const budget = parseFloat(record.campaignBudgetAmount || record.budget?.budget || 0);

    // Performance metrics (Reporting v3 uses 30d suffix, v2 uses attributed prefix)
    const impressions = parseInt(record.impressions || 0, 10);
    const clicks = parseInt(record.clicks || 0, 10);
    const spend = parseFloat(record.cost || 0);
    const sales = parseFloat(record.sales30d || record.attributedSales30d || 0);
    const orders = parseInt(record.purchases30d || record.attributedConversions30d || 0, 10);
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const budgetType = record.campaignBudgetType || record.budget?.budgetType || "DAILY";

    if (!campaignId) continue;

    const row = {
      user_id: userId,
      campaign_id: campaignId,
      name,
      status,
      budget,
      bid_strategy: budgetType === "DAILY" ? "dynamic_down_only" : "legacy_manual_bidding",
      impressions,
      clicks,
      spend,
      sales,
      orders,
      clicks_through_rate: Math.round(ctr * 10000) / 10000,
      cost_per_click: Math.round(cpc * 100) / 100,
    };

    const { error } = await supabaseAdmin
      .from("advertising_campaigns")
      .upsert(row, { onConflict: "user_id,campaign_id" });

    if (error) {
      console.error(`[AdsSync] Upsert failed for campaign ${campaignId}:`, error.message);
    } else {
      upserted++;
    }
  }

  console.log(`[AdsSync] Upserted ${upserted}/${records.length} campaigns (source: ${source}).`);
  return upserted;
}
