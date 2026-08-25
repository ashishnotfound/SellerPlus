"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Mail, MessageSquare, Save, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { useToastStore } from "@/hooks/use-toast-store";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

interface NotificationConfiguration {
  emailDestination: string;
  enableLowStockAlerts: boolean;
  enableDailySummaries: boolean;
  discordConfigured: boolean;
  discordFingerprint: string | null;
}

export function NotificationSettings() {
  const workspaceId = useAuth((state) => state.user?.workspaceId);
  const [settings, setSettings] = useState<NotificationConfiguration>({
    emailDestination: "",
    enableLowStockAlerts: true,
    enableDailySummaries: true,
    discordConfigured: false,
    discordFingerprint: null,
  });
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/notifications");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Notification settings could not be loaded.");
      setSettings(payload.data);
    } catch (error) {
      useToastStore.getState().error("Settings unavailable", error instanceof Error ? error.message : "Try again later.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/notifications", {
        method: "PUT",
        body: JSON.stringify({
          emailDestination: settings.emailDestination,
          discordWebhookUrl,
          enableLowStockAlerts: settings.enableLowStockAlerts,
          enableDailySummaries: settings.enableDailySummaries,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Notification settings could not be saved.");
      setDiscordWebhookUrl("");
      await load();
      useToastStore.getState().success("Saved", "Notification settings were securely saved.");
    } catch (error) {
      useToastStore.getState().error("Save failed", error instanceof Error ? error.message : "Try again later.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnectDiscord() {
    setSaving(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/notifications", {
        method: "DELETE",
        body: JSON.stringify({ provider: "notification_discord" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Discord could not be disconnected.");
      await load();
      useToastStore.getState().success("Disconnected", "The Discord webhook was removed.");
    } catch (error) {
      useToastStore.getState().error("Disconnect failed", error instanceof Error ? error.message : "Try again later.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard>
      <div className="mb-6 flex items-center gap-2.5">
        <Bell className="h-5 w-5 text-indigo-400" />
        <h3 className="text-lg font-bold text-white">Notification channels</h3>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
      ) : (
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-400"><Mail className="h-3.5 w-3.5" /> Direct email</span>
            <input
              type="email"
              value={settings.emailDestination}
              onChange={(event) => setSettings((current) => ({ ...current, emailDestination: event.target.value }))}
              placeholder="alerts@company.com"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-xs font-semibold text-zinc-400"><MessageSquare className="h-3.5 w-3.5" /> Discord webhook</span>
            <input
              type="password"
              autoComplete="new-password"
              value={discordWebhookUrl}
              onChange={(event) => setDiscordWebhookUrl(event.target.value)}
              placeholder={settings.discordConfigured ? "Leave blank to keep the encrypted webhook" : "https://discord.com/api/webhooks/..."}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
            <span className="text-[11px] text-zinc-600">
              {settings.discordConfigured ? `Configured (${settings.discordFingerprint ?? "encrypted"})` : "Not configured"}
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3 text-xs text-zinc-300">
              <input type="checkbox" checked={settings.enableLowStockAlerts} onChange={(event) => setSettings((current) => ({ ...current, enableLowStockAlerts: event.target.checked }))} />
              Low-stock alerts
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3 text-xs text-zinc-300">
              <input type="checkbox" checked={settings.enableDailySummaries} onChange={(event) => setSettings((current) => ({ ...current, enableDailySummaries: event.target.checked }))} />
              Daily summaries
            </label>
          </div>

          <div className="mt-2 flex justify-end gap-3">
            {settings.discordConfigured && (
              <button type="button" onClick={() => void disconnectDiscord()} disabled={saving} className="flex h-10 items-center gap-2 rounded-xl border border-rose-500/20 px-4 text-xs font-semibold text-rose-400 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> Disconnect Discord
              </button>
            )}
            <button type="button" onClick={() => void save()} disabled={saving} className="flex h-10 items-center gap-2 rounded-xl bg-indigo-500 px-5 text-xs font-bold text-white hover:bg-indigo-600 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
