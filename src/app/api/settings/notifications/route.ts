import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";
import { saveCredential } from "@/lib/integrations/credentials";

const updateSchema = z.object({
  emailDestination: z.union([z.string().trim().email().max(320), z.literal("")]),
  discordWebhookUrl: z.union([z.string().trim().url().max(2_000), z.literal("")]).optional(),
  enableLowStockAlerts: z.boolean(),
  enableDailySummaries: z.boolean(),
}).strict();

const deleteSchema = z.object({ provider: z.literal("notification_discord") }).strict();

function approvedDiscordUrl(value: string) {
  const url = new URL(value);
  return url.protocol === "https:"
    && (url.hostname === "discord.com" || url.hostname === "discordapp.com")
    && url.pathname.startsWith("/api/webhooks/");
}

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const [{ data: settings, error: settingsError }, { data: credentials, error: credentialsError }] =
      await Promise.all([
        actor.supabaseAdmin
          .from("notification_settings")
          .select("email_destination, enable_low_stock_alerts, enable_daily_summaries, updated_at")
          .eq("workspace_id", actor.workspaceId)
          .eq("user_id", actor.userId)
          .maybeSingle(),
        actor.supabaseAdmin
          .from("integration_credentials")
          .select("provider, fingerprint, updated_at")
          .eq("workspace_id", actor.workspaceId)
          .in("provider", ["notification_discord", "notification_telegram"]),
      ]);
    if (settingsError || credentialsError) throw settingsError ?? credentialsError;

    const discord = credentials?.find((item) => item.provider === "notification_discord");
    const telegram = credentials?.find((item) => item.provider === "notification_telegram");
    return NextResponse.json({ data: {
      emailDestination: settings?.email_destination ?? "",
      enableLowStockAlerts: settings?.enable_low_stock_alerts ?? true,
      enableDailySummaries: settings?.enable_daily_summaries ?? true,
      discordConfigured: Boolean(discord),
      discordFingerprint: discord?.fingerprint ?? null,
      telegramConfigured: Boolean(telegram),
      updatedAt: settings?.updated_at ?? null,
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const input = updateSchema.parse(await request.json());
    if (input.discordWebhookUrl && !approvedDiscordUrl(input.discordWebhookUrl)) {
      return NextResponse.json({ error: "Use an HTTPS Discord webhook from discord.com." }, { status: 400 });
    }

    const { error } = await actor.supabaseAdmin.from("notification_settings").upsert({
      workspace_id: actor.workspaceId,
      user_id: actor.userId,
      email_destination: input.emailDestination || null,
      discord_webhook_url: null,
      telegram_bot_token: null,
      telegram_chat_id: null,
      enable_low_stock_alerts: input.enableLowStockAlerts,
      enable_daily_summaries: input.enableDailySummaries,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,user_id" });
    if (error) throw error;

    if (input.discordWebhookUrl) {
      await saveCredential(actor.supabaseAdmin, {
        workspaceId: actor.workspaceId,
        provider: "notification_discord",
        credentialKind: "webhook_url",
        secret: input.discordWebhookUrl,
      });
    }

    await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId,
      actor_type: "human",
      actor_id: actor.userId,
      action: "notification_settings.updated",
      resource_type: "notification_settings",
      resource_id: actor.userId,
      new_state: {
        emailConfigured: Boolean(input.emailDestination),
        discordRotated: Boolean(input.discordWebhookUrl),
        enableLowStockAlerts: input.enableLowStockAlerts,
        enableDailySummaries: input.enableDailySummaries,
      },
      source: "settings_api",
    });
    return NextResponse.json({ data: { saved: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid notification settings." }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const input = deleteSchema.parse(await request.json());
    const { error } = await actor.supabaseAdmin
      .from("integration_credentials")
      .delete()
      .eq("workspace_id", actor.workspaceId)
      .eq("provider", input.provider)
      .eq("credential_kind", "webhook_url")
      .is("marketplace_account_id", null);
    if (error) throw error;
    await actor.supabaseAdmin.from("audit_events").insert({
      workspace_id: actor.workspaceId,
      actor_type: "human",
      actor_id: actor.userId,
      action: "notification_integration.disconnected",
      resource_type: "notification_provider",
      resource_id: input.provider,
      source: "settings_api",
    });
    return NextResponse.json({ data: { disconnected: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid notification provider." }, { status: 400 });
    }
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
