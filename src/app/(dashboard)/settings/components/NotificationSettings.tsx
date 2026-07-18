"use client";

import React, { useState, useEffect } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { Bell, Save, Mail, MessageSquare, Bot } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";

export function NotificationSettings() {
  const user = useAuth((s) => s.user);
  const [settings, setSettings] = useState({
    id: "",
    email_destination: "",
    discord_webhook_url: "",
    telegram_bot_token: "",
    telegram_chat_id: "",
    enable_low_stock_alerts: true,
    enable_daily_summaries: true,
  });

  useEffect(() => {
    async function fetchSettings() {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from("notification_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) {
          setSettings({
            id: data.id,
            email_destination: data.email_destination || "",
            discord_webhook_url: data.discord_webhook_url || "",
            telegram_bot_token: data.telegram_bot_token || "",
            telegram_chat_id: data.telegram_chat_id || "",
            enable_low_stock_alerts: data.enable_low_stock_alerts,
            enable_daily_summaries: data.enable_daily_summaries,
          });
        }
      } catch (err) {
        console.error("Failed to load notifications settings", err);
      }
    }
    fetchSettings();
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    try {
      const payload = {
        user_id: user.id,
        ...settings,
      };
      
      const { error } = await supabase
        .from("notification_settings")
        .upsert(payload, { onConflict: "user_id" });
        
      if (error) throw error;
      useToastStore.getState().success("Saved", "Notification settings saved.");
    } catch (err: any) {
      useToastStore.getState().error("Save Failed", err.message);
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-2.5 mb-6">
        <Bell className="w-5 h-5 text-indigo-400" />
        <h3 className="text-lg font-bold text-white">Notification Channels</h3>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-400 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5" /> Direct Email
          </label>
          <input
            type="email"
            value={settings.email_destination}
            onChange={(e) => setSettings({ ...settings, email_destination: e.target.value })}
            placeholder="alerts@company.com"
            className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-400 flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5" /> Discord Webhook
          </label>
          <input
            type="url"
            value={settings.discord_webhook_url}
            onChange={(e) => setSettings({ ...settings, discord_webhook_url: e.target.value })}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 transition-all"
          />
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={handleSave}
            className="h-11 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs flex items-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" /> Save Integrations
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
