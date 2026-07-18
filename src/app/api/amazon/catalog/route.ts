import { NextResponse } from "next/server";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { asin, userId: bodyUserId } = body;

    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request, bodyUserId);

    if (!asin) {
      return NextResponse.json({ error: "ASIN is required" }, { status: 400 });
    }

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
    const region = connection.marketplace;
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
    let marketplaceId = "A21TJRUUN4KGV"; // default to India (amazon.in)

    const normRegion = (region || "").toLowerCase();
    if (normRegion.includes("us") || normRegion.includes("north america") || normRegion.includes("com")) {
      spApiUrl = "https://sellingpartnerapi-na.amazon.com";
      marketplaceId = "ATVPDKIKX0DER";
    } else if (normRegion.includes("europe") || normRegion.includes("co.uk") || normRegion.includes("uk")) {
      spApiUrl = "https://sellingpartnerapi-eu.amazon.com";
      marketplaceId = "A1F83G8C2ARO7P"; // UK
    } else if (normRegion.includes("far east") || normRegion.includes("japan") || normRegion.includes("jp")) {
      spApiUrl = "https://sellingpartnerapi-fe.amazon.com";
      marketplaceId = "A1VC38T7YXB528"; // Japan
    }

    if (sandbox) {
      spApiUrl = spApiUrl.replace("https://", "https://sandbox.");
    }

    // 3. Fetch Catalog Item from SP-API
    const catalogUrl = `${spApiUrl}/catalog/2022-04-01/items/${asin}?marketplaceIds=${marketplaceId}&includedData=summaries,attributes`;
    
    console.log("[SP-API Catalog Audit] Initiating Amazon SP-API Request:");
    console.log(`  - Request URL: ${catalogUrl}`);
    console.log(`  - Endpoint: /catalog/2022-04-01/items/${asin}`);
    console.log(`  - Region: ${region || "Default (EU/IN)"}`);
    console.log(`  - LWA Token Generation: SUCCESS`);
    console.log(`  - Access Token (Prefix): ${accessToken ? accessToken.slice(0, 15) + "..." : "NONE"}`);

    const catalogRes = await fetch(catalogUrl, {
      method: "GET",
      headers: {
        "x-amz-access-token": accessToken,
        "Accept": "application/json"
      }
    });

    console.log(`[SP-API Catalog Audit] Amazon SP-API Response Status: ${catalogRes.status}`);

    if (!catalogRes.ok) {
      const errText = await catalogRes.text();
      console.error("[SP-API Catalog Audit] Amazon SP-API Request FAILED!");
      console.error(`  - HTTP Status: ${catalogRes.status}`);
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
        error: `Amazon SP-API Catalog Fetch Failed (HTTP ${catalogRes.status})`,
        rawError: {
          status: catalogRes.status,
          code: errorCode,
          message: errorMessage,
          details: errorDetails,
          body: errText
        }
      }, { status: catalogRes.status });
    }

    const catalogData = await catalogRes.json();
    
    // Parse values from SP-API Catalog Items response structure
    const summary = catalogData.summaries?.[0] || {};
    const attributes = catalogData.attributes || {};

    // Try to resolve a description or bullet points from attributes
    const bulletPoints = attributes.bullet_point?.map((bp: any) => bp.value) || [];
    const description = attributes.product_description?.[0]?.value || bulletPoints.join(". ") || "";

    return NextResponse.json({
      success: true,
      asin: catalogData.asin || asin,
      title: summary.itemName || "",
      brand: summary.brandName || "",
      manufacturer: summary.manufacturerName || "",
      productType: summary.productType || "",
      imageUrl: summary.mainImage?.link || "",
      description: description,
      category: summary.classifications?.[0]?.displayName || ""
    });

  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error("API Error during Amazon catalog fetch:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
