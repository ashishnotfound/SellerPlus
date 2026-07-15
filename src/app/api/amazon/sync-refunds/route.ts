/**
 * SellerPlus OS — Amazon Refunds Sync API
 *
 * Syncs real refund data from the Amazon SP-API Finances API
 * (Financial Events endpoint). Fetches RefundEventList from the
 * last 90 days and upserts them into the `refunds` table.
 *
 * Uses JWT-verified user identity — userId is never trusted from request body.
 *
 * SP-API endpoint: GET /finances/v0/financialEvents
 * Rate limit: 0.5 req/s (burst 30), respects backoff.
 */

import { NextResponse } from "next/server";
import {
  authenticateWithDevFallback,
  authErrorResponse,
} from "@/lib/auth-middleware";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getLwaAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
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
    throw new Error(`LWA token exchange failed (HTTP ${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

function resolveSpApiEndpoint(region: string, sandbox?: boolean): string {
  let endpoint = "https://sellingpartnerapi-eu.amazon.com"; // default India/EU
  const norm = (region || "").toLowerCase();

  if (norm.includes("us") || norm.includes("north america") || norm.includes("com")) {
    endpoint = "https://sellingpartnerapi-na.amazon.com";
  } else if (norm.includes("europe") || norm.includes("co.uk") || norm.includes("uk")) {
    endpoint = "https://sellingpartnerapi-eu.amazon.com";
  } else if (norm.includes("far east") || norm.includes("japan") || norm.includes("jp")) {
    endpoint = "https://sellingpartnerapi-fe.amazon.com";
  }

  return sandbox ? endpoint.replace("https://", "https://sandbox.") : endpoint;
}

async function fetchWithBackoff(url: string, headers: Record<string, string>, maxRetries = 5): Promise<Response> {
  let delay = 1000;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      console.warn(`[RefundsSync] Rate limited. Waiting ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30000);
      continue;
    }
    return res;
  }
  throw new Error(`Rate limit exceeded after ${maxRetries} retries`);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      clientId,
      clientSecret,
      refreshToken,
      region,
      sandbox,
      userId: bodyUserId,
      daysBack = 90,
    } = body;

    // Authenticate: JWT in production, body userId in development
    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request, bodyUserId);

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        { error: "Missing required Amazon credentials (clientId, clientSecret, refreshToken)." },
        { status: 400 }
      );
    }

    const spApiUrl = resolveSpApiEndpoint(region || "", sandbox || false);
    const accessToken = await getLwaAccessToken(clientId, clientSecret, refreshToken);

    const headers = {
      "x-amz-access-token": accessToken,
      "Accept": "application/json",
    };

    // ── Fetch financial events (paginated) ────────────────────────────────────
    const postedAfter = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const postedBefore = new Date().toISOString();

    let allRefundEvents: any[] = [];
    let nextToken: string | null = null;
    let pageCount = 0;

    do {
      let url: string;
      if (nextToken) {
        url = `${spApiUrl}/finances/v0/financialEvents?NextToken=${encodeURIComponent(nextToken)}`;
      } else {
        url = `${spApiUrl}/finances/v0/financialEvents?PostedAfter=${encodeURIComponent(postedAfter)}&PostedBefore=${encodeURIComponent(postedBefore)}`;
      }

      console.log(`[RefundsSync] Fetching financial events page ${pageCount + 1}: ${url}`);
      const res = await fetchWithBackoff(url, headers);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Finances API failed (HTTP ${res.status}): ${errText}`);
      }

      const data = await res.json();
      const events = data.payload?.FinancialEvents;

      if (events) {
        const refunds = events.RefundEventList || [];
        allRefundEvents.push(...refunds);
        console.log(`[RefundsSync] Page ${pageCount + 1}: ${refunds.length} refund events.`);
      }

      nextToken = data.payload?.NextToken || null;
      pageCount++;

      // Rate limit: Finances API is 0.5 req/s
      if (nextToken) {
        await new Promise((r) => setTimeout(r, 2100));
      }
    } while (nextToken && pageCount < 20); // Safety cap: 20 pages max

    console.log(`[RefundsSync] Total refund events fetched: ${allRefundEvents.length}`);

    if (allRefundEvents.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: `No refund events found in the last ${daysBack} days.`,
      });
    }

    // ── Parse and upsert refunds ──────────────────────────────────────────────
    let upserted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const refundEvent of allRefundEvents) {
      try {
        const orderId = refundEvent.AmazonOrderId || "";
        const processedAt = refundEvent.PostedDate || new Date().toISOString();

        // Each refund event can have multiple shipment items
        const shipmentItems: any[] = refundEvent.ShipmentItemAdjustmentList || [];

        for (const item of shipmentItems) {
          const sku = item.SellerSKU || "";
          const asin = item.ASIN || "";
          const quantity = Math.abs(parseInt(item.QuantityShipped || "1", 10));

          // Sum item charges (ItemChargeAdjustmentList)
          let amount = 0;
          const charges: any[] = item.ItemChargeAdjustmentList || [];
          for (const charge of charges) {
            const chargeAmount = parseFloat(charge.ChargeAmount?.CurrencyAmount || "0");
            // Refund amounts are typically negative in the API — we store as positive
            amount += Math.abs(chargeAmount);
          }

          // Derive reason from ShipmentItemAdjustmentList or parent event
          const reason = item.ItemChargeAdjustmentList?.[0]?.ChargeType || "Customer Return";

          const refundId = `${orderId}_${sku}_${processedAt}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);

          if (!orderId && !sku) continue;

          const row = {
            user_id: userId,
            refund_id: refundId,
            order_id: orderId,
            sku: sku || null,
            asin: asin || null,
            quantity,
            amount,
            reason,
            status: "Processed",
            processed_at: processedAt,
            marketplace: "IN", // Default; could be derived from marketplace ID if available
          };

          const { error } = await supabaseAdmin
            .from("refunds")
            .upsert(row, { onConflict: "user_id,refund_id,sku" });

          if (error) {
            failed++;
            errors.push(`${refundId}: ${error.message}`);
          } else {
            upserted++;
          }
        }

        // If no shipment items, record the order-level refund
        if (shipmentItems.length === 0 && orderId) {
          const amount = 0; // No itemized data available
          const refundId = `${orderId}_order_${processedAt}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);

          const row = {
            user_id: userId,
            refund_id: refundId,
            order_id: orderId,
            sku: null,
            asin: null,
            quantity: 1,
            amount,
            reason: "Return",
            status: "Processed",
            processed_at: processedAt,
            marketplace: "IN",
          };

          const { error } = await supabaseAdmin
            .from("refunds")
            .upsert(row, { onConflict: "user_id,refund_id,sku" });

          if (error) {
            failed++;
          } else {
            upserted++;
          }
        }
      } catch (e: any) {
        failed++;
        errors.push(e.message);
      }
    }

    console.log(`[RefundsSync] Upserted ${upserted} refund records. Failed: ${failed}.`);

    return NextResponse.json({
      success: true,
      count: upserted,
      failed,
      totalEvents: allRefundEvents.length,
      errors: errors.slice(0, 10), // Return first 10 errors for debugging
    });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error("[SyncRefundsRoute] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
