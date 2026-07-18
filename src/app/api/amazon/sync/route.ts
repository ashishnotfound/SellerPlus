import { NextResponse } from "next/server";
import zlib from "zlib";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, reportId, reportDocumentId, userId: bodyUserId } = body;

    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request, bodyUserId);

    // Fetch credentials from DB securely
    const { data: connection, error: connError } = await supabaseAdmin
      .from("amazon_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (connError || !connection) {
      return NextResponse.json({ error: "No active Amazon connection found. Please connect your Amazon account in Settings." }, { status: 400 });
    }

    const { decryptToken } = await import("@/lib/encryption");
    const clientId = decryptToken(connection.client_id);
    const clientSecret = decryptToken(connection.client_secret);
    const refreshToken = decryptToken(connection.refresh_token);
    const sellerId = connection.seller_id;
    const marketplaceId = connection.marketplace_id;
    const region = connection.marketplace; // Using this to map to the correct SP-API url below
    const sandbox = connection.is_sandbox;

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json({ error: "Corrupted Amazon credentials in database." }, { status: 500 });
    }

    // 1. Exchange refresh token for LWA Access Token
    const tokenUrl = "https://api.amazon.com/auth/o2/token";
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        refresh_token: refreshToken.trim()
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return NextResponse.json({ error: `Amazon Auth Exchange Failed: ${errText}` }, { status: 401 });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Resolve regional Selling Partner API endpoint and Marketplace ID
    let spApiUrl = "https://sellingpartnerapi-eu.amazon.com"; // default to EU / India
    let activeMarketplaceId = marketplaceId || "A21TJRUUN4KGV"; // default to India (amazon.in)

    const normRegion = (region || "").toLowerCase();
    if (normRegion.includes("us") || normRegion.includes("north america") || normRegion.includes("com")) {
      spApiUrl = "https://sellingpartnerapi-na.amazon.com";
      activeMarketplaceId = marketplaceId || "ATVPDKIKX0DER";
    } else if (normRegion.includes("europe") || normRegion.includes("co.uk") || normRegion.includes("uk")) {
      spApiUrl = "https://sellingpartnerapi-eu.amazon.com";
      activeMarketplaceId = marketplaceId || "A1F83G8C2ARO7P"; // UK
    } else if (normRegion.includes("far east") || normRegion.includes("japan") || normRegion.includes("jp")) {
      spApiUrl = "https://sellingpartnerapi-fe.amazon.com";
      activeMarketplaceId = marketplaceId || "A1VC38T7YXB528"; // Japan
    }

    if (sandbox) {
      spApiUrl = spApiUrl.replace("https://", "https://sandbox.");
    }

    // ==========================================
    // ACTION: STATUS (Poll report status)
    // ==========================================
    if (action === "status") {
      if (!reportId) {
        return NextResponse.json({ error: "Missing required reportId parameter" }, { status: 400 });
      }

      const statusUrl = `${spApiUrl}/reports/2021-06-30/reports/${reportId}`;
      console.log(`[SP-API Reports Audit] Checking report status:`);
      console.log(`  - Request URL: ${statusUrl}`);

      const statusRes = await fetch(statusUrl, {
        method: "GET",
        headers: {
          "x-amz-access-token": accessToken,
          "Accept": "application/json"
        }
      });

      console.log(`[SP-API Reports Audit] Status API Response Code: ${statusRes.status}`);

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        console.error(`[SP-API Reports Audit] Status check failed: ${errText}`);
        return NextResponse.json({ success: false, error: `Amazon SP-API Report Status Check Failed: ${errText}` }, { status: statusRes.status });
      }

      const statusData = await statusRes.json();
      console.log(`[SP-API Reports Audit] Status Response Payload:`, JSON.stringify(statusData, null, 2));

      return NextResponse.json({
        success: true,
        status: statusData.processingStatus, // SUBMITTED, IN_PROGRESS, DONE, FATAL, CANCELLED
        reportDocumentId: statusData.reportDocumentId
      });
    }

    // ==========================================
    // ACTION: IMPORT (Download, decompress, parse report)
    // ==========================================
    if (action === "import") {
      if (!reportDocumentId) {
        return NextResponse.json({ error: "Missing required reportDocumentId parameter" }, { status: 400 });
      }

      const docUrl = `${spApiUrl}/reports/2021-06-30/documents/${reportDocumentId}`;
      console.log(`[SP-API Reports Audit] Fetching report document metadata:`);
      console.log(`  - Request URL: ${docUrl}`);

      const docRes = await fetch(docUrl, {
        method: "GET",
        headers: {
          "x-amz-access-token": accessToken,
          "Accept": "application/json"
        }
      });

      console.log(`[SP-API Reports Audit] Document Metadata Response Code: ${docRes.status}`);

      if (!docRes.ok) {
        const errText = await docRes.text();
        console.error(`[SP-API Reports Audit] Fetching doc metadata failed: ${errText}`);
        return NextResponse.json({ success: false, error: `Amazon SP-API Fetch Document Info Failed: ${errText}` }, { status: docRes.status });
      }

      const docData = await docRes.json();
      console.log(`[SP-API Reports Audit] Document Metadata Payload:`, JSON.stringify(docData, null, 2));

      const downloadUrl = docData.url;
      const compression = docData.compressionAlgorithm;

      console.log(`[SP-API Reports Audit] Downloading report file from S3:`);
      console.log(`  - S3 Pre-signed URL: ${downloadUrl}`);
      console.log(`  - Compression Algorithm: ${compression || "NONE"}`);

      const downloadRes = await fetch(downloadUrl);
      console.log(`[SP-API Reports Audit] S3 Download Response Code: ${downloadRes.status}`);

      if (!downloadRes.ok) {
        const errText = await downloadRes.text();
        return NextResponse.json({ success: false, error: `S3 Download Failed: ${errText}` }, { status: downloadRes.status });
      }

      const arrayBuffer = await downloadRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      let textContent = "";

      if (compression === "GZIP") {
        try {
          textContent = zlib.gunzipSync(buffer).toString("utf8");
          console.log(`[SP-API Reports Audit] GZIP Decompression SUCCESS! Payload size: ${textContent.length} chars.`);
        } catch (e: any) {
          console.error(`[SP-API Reports Audit] GZIP Decompression FAILED:`, e);
          return NextResponse.json({ success: false, error: `Decompression of Amazon report failed: ${e.message}` }, { status: 500 });
        }
      } else {
        textContent = buffer.toString("utf8");
        console.log(`[SP-API Reports Audit] Read plain document text. Payload size: ${textContent.length} chars.`);
      }

      // Parse TSV rows
      const lines = textContent.split(/\r?\n/);
      if (lines.length === 0 || !lines[0].trim()) {
        return NextResponse.json({ success: true, items: [] });
      }

      const headers = lines[0].split("\t");
      console.log("[SP-API Reports Audit] Parsed TSV Headers:", headers);

      const items: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const cols = line.split("\t");

        const sku = cols[headers.indexOf("seller-sku")] || "";
        const asin = cols[headers.indexOf("asin")] || cols[headers.indexOf("product-id")] || "";
        const title = cols[headers.indexOf("item-name")] || "";
        const description = cols[headers.indexOf("item-description")] || "";
        const quantity = parseInt(cols[headers.indexOf("quantity")] || "0", 10);
        const price = parseFloat(cols[headers.indexOf("price")] || "0");
        const fulfillmentChannelRaw = cols[headers.indexOf("fulfillment-channel")] || "";
        // DEFAULT means merchant fulfilled (FBM), AMAZON means FBA
        const isFba = fulfillmentChannelRaw.toUpperCase().includes("AMAZON");

        if (!sku && !asin) continue;

        items.push({
          asin,
          sku,
          title,
          description,
          availableQty: quantity,
          price,
          isFba
        });
      }

      console.log(`[SP-API Reports Audit] Parsed ${items.length} items from Amazon Listings Report.`);
      return NextResponse.json({ success: true, items });
    }

    // ==========================================
    // ACTION: REQUEST (Default flow: Validate & request report creation)
    // ==========================================
    
    // 3. Validate Connection using Sellers API (marketplaceParticipations) - Seller-agnostic endpoint
    const sellersUrl = `${spApiUrl}/sellers/v1/marketplaceParticipations`;
    console.log(`[SP-API Sync Audit] Validating connection via Sellers API:`);
    console.log(`  - Request URL: ${sellersUrl}`);

    const sellersRes = await fetch(sellersUrl, {
      method: "GET",
      headers: {
        "x-amz-access-token": accessToken,
        "Accept": "application/json"
      }
    });

    console.log(`[SP-API Sync Audit] Sellers API Response Status: ${sellersRes.status}`);

    if (!sellersRes.ok) {
      const errText = await sellersRes.text();
      console.error("[SP-API Sync Audit] Sellers API Validation FAILED!");
      console.error(`  - HTTP Status: ${sellersRes.status}`);
      console.error(`  - Response Body: ${errText}`);

      let errJson = null;
      try {
        errJson = JSON.parse(errText);
      } catch (_) {}

      const firstError = errJson?.errors?.[0] || {};
      const errorCode = firstError.code || "UnknownCode";
      const errorMessage = firstError.message || "No error message provided";
      const errorDetails = firstError.details || "No details provided";

      return NextResponse.json({
        success: false,
        error: `Amazon SP-API Validation Failed (HTTP ${sellersRes.status})`,
        roleError: sellersRes.status === 403 || sellersRes.status === 400,
        rawError: {
          status: sellersRes.status,
          code: errorCode,
          message: errorMessage,
          details: errorDetails,
          body: errText
        }
      }, { status: sellersRes.status });
    }

    const sellersData = await sellersRes.json();
    console.log("[SP-API Sync Audit] Sellers API Response Status:", sellersRes.status);
    console.log("[SP-API Sync Audit] Sellers API Raw Response Payload:", JSON.stringify(sellersData, null, 2));

    // Submit listings report request to Reports API
    const reportRequestUrl = `${spApiUrl}/reports/2021-06-30/reports`;
    console.log(`[SP-API Reports Audit] Submitting GET_MERCHANT_LISTINGS_ALL_DATA report request:`);
    console.log(`  - Request URL: ${reportRequestUrl}`);

    const reportRes = await fetch(reportRequestUrl, {
      method: "POST",
      headers: {
        "x-amz-access-token": accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reportType: "GET_MERCHANT_LISTINGS_ALL_DATA",
        marketplaceIds: [activeMarketplaceId]
      })
    });

    console.log(`[SP-API Reports Audit] Reports API Submit Response Code: ${reportRes.status}`);

    if (!reportRes.ok) {
      const errText = await reportRes.text();
      console.error(`[SP-API Reports Audit] Submitting listings report failed: ${errText}`);
      return NextResponse.json({
        success: false,
        error: `Submitting listings report failed (HTTP ${reportRes.status}): ${errText}`
      }, { status: reportRes.status });
    }

    const reportData = await reportRes.json();
    console.log(`[SP-API Reports Audit] Submit Listings Report SUCCESS:`, JSON.stringify(reportData, null, 2));

    return NextResponse.json({
      success: true,
      reportId: reportData.reportId
    });

  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error("API Error during Amazon sync routing:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
