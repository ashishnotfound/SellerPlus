import { NextResponse } from "next/server";
import { authenticateWithDevFallback } from "@/lib/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import { log } from "@/lib/logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET(req: Request) {
  try {
    const user = await authenticateWithDevFallback(req);
    const { searchParams } = new URL(req.url);

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    if (errorParam) {
      log.error(`[API/Amazon] OAuth error: ${errorParam} - ${errorDesc}`);
      return NextResponse.redirect(new URL(`/settings?amazon_error=${encodeURIComponent(errorDesc || errorParam)}`, req.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL(`/settings?amazon_error=Missing_code_or_state`, req.url));
    }

    // State is formatted as `${provider}:${uuid}`
    const provider = state.split(":")[0];
    if (provider !== "sp" && provider !== "ads") {
      return NextResponse.redirect(new URL(`/settings?amazon_error=Invalid_provider`, req.url));
    }

    // Prepare credentials for token exchange
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: customCreds } = await supabaseAdmin
      .from("amazon_developer_credentials")
      .select("*")
      .eq("user_id", user.userId)
      .maybeSingle();

    const clientId = provider === "sp" 
      ? (customCreds?.sp_client_id || process.env.NEXT_PUBLIC_AMAZON_SP_CLIENT_ID)
      : (customCreds?.ads_client_id || process.env.NEXT_PUBLIC_AMAZON_ADS_CLIENT_ID);
      
    const clientSecret = provider === "sp"
      ? (customCreds?.sp_client_secret || process.env.AMAZON_SP_CLIENT_SECRET)
      : (customCreds?.ads_client_secret || process.env.AMAZON_ADS_CLIENT_SECRET);

    const redirectUri = process.env.NEXT_PUBLIC_AMAZON_OAUTH_REDIRECT_URI || `${new URL(req.url).origin}/api/amazon/callback`;

    if (!clientId || !clientSecret) {
      log.error(`[API/Amazon] Missing environment credentials for provider ${provider}`);
      return NextResponse.redirect(new URL(`/settings?amazon_error=Server_misconfigured`, req.url));
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      log.error(`[API/Amazon] Token exchange failed: ${JSON.stringify(tokenData)}`);
      return NextResponse.redirect(new URL(`/settings?amazon_error=Token_exchange_failed`, req.url));
    }

    // Save tokens in Supabase using the service role to bypass RLS for inserts
    
    // Calculate expiration timestamp
    const expiresInSecs = tokenData.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresInSecs * 1000).toISOString();

    const { error: dbError } = await supabaseAdmin
      .from("amazon_user_tokens")
      .upsert({
        supabase_user_id: user.userId,
        provider,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        scope: tokenData.scope || null
      }, {
        onConflict: "supabase_user_id, provider"
      });

    if (dbError) {
      log.error(`[API/Amazon] Database save failed: ${dbError.message}`);
      return NextResponse.redirect(new URL(`/settings?amazon_error=Database_error`, req.url));
    }

    log.info(`[API/Amazon] Successfully connected Amazon ${provider} API for user ${user.userId}`);
    return NextResponse.redirect(new URL(`/settings?amazon_connected=true`, req.url));

  } catch (err: any) {
    log.error(`[API/Amazon] Unhandled error during callback: ${err.message}`);
    return NextResponse.redirect(new URL(`/settings?amazon_error=Internal_error`, req.url));
  }
}
