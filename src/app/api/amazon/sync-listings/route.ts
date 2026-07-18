import { NextRequest, NextResponse } from "next/server";
import { authenticateWithDevFallback } from "@/lib/auth-middleware";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { syncAmazonListings } from "@/lib/amazon-sync-service";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate User
    const user = await authenticateWithDevFallback(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Initialize Supabase Admin for DB ops
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // 3. Fetch Credentials
    const { data: creds, error: credsError } = await supabase
      .from("amazon_developer_credentials")
      .select("*")
      .eq("user_id", user.userId)
      .single();

    const { data: userToken } = await supabase
      .from("amazon_user_tokens")
      .select("refresh_token")
      .eq("supabase_user_id", user.userId)
      .eq("provider", "sp")
      .maybeSingle();

    const refreshToken = userToken?.refresh_token || creds?.sp_refresh_token;

    if (!refreshToken) {
      return NextResponse.json({ 
        error: "No Amazon credentials found or missing refresh token.",
      }, { status: 400 });
    }

    // 4. Run Sync Engine
    const result = await syncAmazonListings(
      supabase,
      user.userId,
      {
        clientId: process.env.NEXT_PUBLIC_AMAZON_SP_CLIENT_ID || creds?.sp_client_id,
        clientSecret: process.env.AMAZON_SP_CLIENT_SECRET || creds?.sp_client_secret,
        refreshToken: refreshToken,
        region: creds?.region || "IN", 
        sandbox: false
      }
    );

    if (result.error) {
      log.error(`[SyncListingsAPI] Failed for user ${user.userId}: ${result.error}`);
      return NextResponse.json({ 
        error: "Failed to sync listings", 
        details: result.error 
      }, { status: 500 });
    }

    // 5. Return Summary
    return NextResponse.json(result);
    
  } catch (err: any) {
    log.error(`[SyncListingsAPI] Unexpected error: ${err.message}`);
    return NextResponse.json({ 
      error: "Internal server error during sync",
      details: err.message
    }, { status: 500 });
  }
}
