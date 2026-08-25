import { NextResponse } from "next/server";
import { sendNotification } from "@/lib/notifications";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const inputSchema = z.object({
  provider: z.enum(["email", "discord", "telegram"]),
  email: z.string().email().max(320).optional(),
  webhookUrl: z.string().url().max(2_000).optional(),
  botToken: z.string().min(20).max(256).optional(),
  chatId: z.string().min(1).max(128).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const { provider, email, webhookUrl, botToken, chatId } = inputSchema.parse(await request.json());

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

    const status = result[provider as keyof typeof result];
    if (!status?.success) {
      return NextResponse.json({ success: false, error: status?.error ?? "Provider did not return a delivery result." }, { status: 502 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully sent test message to ${provider.toUpperCase()}`,
      detail: status
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json({ success: false, error: authErr.body.error }, { status: authErr.status });
    }
    console.error("[NotificationsTest] Dispatch failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to deliver message." }, { status: 500 });
  }
}
