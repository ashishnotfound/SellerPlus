import { NextResponse } from "next/server";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";
import { syncOrders, AmazonCredentials } from "@/lib/amazon-sync-service";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientId, clientSecret, refreshToken, region, sandbox, userId: bodyUserId } = body;

    const { userId } = await authenticateWithDevFallback(request, bodyUserId);

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        { error: "Missing required auth credentials (Client ID, Client Secret, Refresh Token)" },
        { status: 400 }
      );
    }

    const credentials: AmazonCredentials = {
      clientId,
      clientSecret,
      refreshToken,
      region,
      sandbox,
    };

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const summary = await syncOrders(supabase, userId, credentials, since);

    if (summary.errors && summary.errors.length > 0) {
      return NextResponse.json(
        { error: "Order sync completed with errors.", details: summary.errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error("API Error during Amazon orders sync:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
