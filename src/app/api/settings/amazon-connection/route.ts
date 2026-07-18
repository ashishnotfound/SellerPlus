import { NextResponse } from "next/server";
import { authenticate, authErrorResponse } from "@/lib/auth-middleware";
import { encryptToken } from "@/lib/encryption";

export async function POST(request: Request) {
  try {
    const { userId, supabaseAdmin } = await authenticate(request);
    
    const body = await request.json();
    const { sellerId, marketplace, marketplaceId, clientId, clientSecret, refreshToken, isSandbox } = body;

    if (!sellerId || !clientId || !clientSecret || !refreshToken) {
      return NextResponse.json({ error: "Missing required credentials." }, { status: 400 });
    }

    // Encrypt the sensitive fields
    const encryptedClientId = encryptToken(clientId.trim());
    const encryptedClientSecret = encryptToken(clientSecret.trim());
    const encryptedRefreshToken = encryptToken(refreshToken.trim());

    // Upsert into amazon_connections using Service Role to bypass RLS on write (or we can use user client)
    // Here we use supabaseAdmin since the user is authenticated and we control the userId payload
    const { data, error } = await supabaseAdmin
      .from("amazon_connections")
      .upsert(
        {
          user_id: userId,
          seller_id: sellerId.trim(),
          marketplace: marketplace || 'India (amazon.in)',
          marketplace_id: marketplaceId || 'A21TJRUUN4KGV',
          client_id: encryptedClientId,
          client_secret: encryptedClientSecret,
          refresh_token: encryptedRefreshToken,
          is_sandbox: !!isSandbox,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error("[Amazon Connection] Failed to save credentials:", error);
      return NextResponse.json({ error: "Failed to save Amazon connection securely." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Credentials encrypted and stored successfully." });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    return NextResponse.json(authErr.body, { status: authErr.status });
  }
}
