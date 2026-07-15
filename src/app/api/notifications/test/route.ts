import { NextResponse } from "next/server";
import { sendNotification } from "@/lib/notifications";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, email, webhookUrl, botToken, chatId, userId: bodyUserId } = body;

    // Verify authenticated user context
    const { userId } = await authenticateWithDevFallback(request, bodyUserId);

    if (!provider) {
      return NextResponse.json({ success: false, error: "Missing provider field" }, { status: 400 });
    }

    const testPayload = {
      title: "SellerPlus OS Connection Test",
      message: `Hello! This is a real-time integration test verifying your ${provider.toUpperCase()} notification channel in SellerPlus OS. Everything is configured correctly!`
    };

    let result;
    if (provider === "email") {
      if (!email) return NextResponse.json({ success: false, error: "Missing email address" }, { status: 400 });
      result = await sendNotification({ ...testPayload, email });
    } else if (provider === "discord") {
      if (!webhookUrl) return NextResponse.json({ success: false, error: "Missing webhook URL" }, { status: 400 });
      result = await sendNotification({ ...testPayload, discordUrl: webhookUrl });
    } else if (provider === "telegram") {
      if (!botToken || !chatId) return NextResponse.json({ success: false, error: "Missing Bot Token or Chat ID" }, { status: 400 });
      result = await sendNotification({ ...testPayload, telegramBotToken: botToken, telegramChatId: chatId });
    } else {
      return NextResponse.json({ success: false, error: "Unsupported channel type" }, { status: 400 });
    }

    // Extract status of tested channel
    const status = result[provider as keyof typeof result];
    if (status && !status.success) {
      return NextResponse.json({ success: false, error: status.error });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully sent test message to ${provider.toUpperCase()}`,
      detail: status
    });

  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json({ success: false, error: authErr.body.error }, { status: authErr.status });
    }
    console.error("[NotificationsTest] Dispatch failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to deliver message." }, { status: 500 });
  }
}
