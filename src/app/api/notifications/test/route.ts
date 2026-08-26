import { NextResponse } from "next/server";
import { sendNotification } from "@/lib/notifications";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { readCredential } from "@/lib/integrations/credentials";

const inputSchema = z.object({
  provider: z.enum(["email", "discord", "telegram"]),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const { provider } = inputSchema.parse(await request.json());

    const testPayload = {
      title: "SellerPlus OS Connection Test",
      message: `Hello! This is a real-time integration test verifying your ${provider.toUpperCase()} notification channel in SellerPlus OS. Everything is configured correctly!`
    };

    let result;
    if (provider === "email") {
      const { data, error } = await actor.supabaseAdmin
        .from("notification_settings")
        .select("email_destination")
        .eq("workspace_id", actor.workspaceId)
        .eq("user_id", actor.userId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.email_destination) {
        return NextResponse.json({ success: false, error: "No email destination is configured for this workspace." }, { status: 409 });
      }
      result = await sendNotification({ ...testPayload, email: data.email_destination });
    } else if (provider === "discord") {
      const credential = await readCredential(actor.supabaseAdmin, {
        workspaceId: actor.workspaceId,
        provider: "notification_discord",
        credentialKind: "webhook_url",
      });
      if (!credential?.secret) {
        return NextResponse.json({ success: false, error: "No encrypted Discord webhook is configured for this workspace." }, { status: 409 });
      }
      result = await sendNotification({ ...testPayload, discordUrl: credential.secret });
    } else if (provider === "telegram") {
      const credential = await readCredential(actor.supabaseAdmin, {
        workspaceId: actor.workspaceId,
        provider: "notification_telegram",
        credentialKind: "bot_token",
      });
      const chatId = typeof credential?.metadata.chatId === "string" ? credential.metadata.chatId : "";
      if (!credential?.secret || !chatId) {
        return NextResponse.json({ success: false, error: "No encrypted Telegram bot and chat configuration is available for this workspace." }, { status: 409 });
      }
      result = await sendNotification({ ...testPayload, telegramBotToken: credential.secret, telegramChatId: chatId });
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

  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    const authErr = authErrorResponse(error);
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ success: false, error: authErr.body.error }, { status: authErr.status });
    }
    console.error("[NotificationsTest] Dispatch failed:", error);
    return NextResponse.json({ success: false, error: "Notification test could not be completed." }, { status: 500 });
  }
}
