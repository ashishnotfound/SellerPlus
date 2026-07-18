"use client";

import React, { useState, useEffect } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { Bot, Save, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";

export function LLMSettings() {
  const user = useAuth((s) => s.user);
  
  const [configs, setConfigs] = useState<Record<string, any>>({
    gemini: { provider: "gemini", api_key: "", model_name: "gemini-1.5-flash", is_enabled: true },
    openai: { provider: "openai", api_key: "", model_name: "gpt-4o", is_enabled: false },
    anthropic: { provider: "anthropic", api_key: "", model_name: "claude-3-5-sonnet", is_enabled: false },
  });
  
  const [activeTab, setActiveTab] = useState("gemini");

  useEffect(() => {
    async function fetchConfigs() {
      const { data, error } = await supabase.from("llm_settings").select("*");
      if (!error && data) {
        const newConfigs = { ...configs };
        data.forEach((item: any) => {
          if (newConfigs[item.provider]) {
            newConfigs[item.provider] = item;
          }
        });
        setConfigs(newConfigs);
      }
    }
    if (user?.id) {
      fetchConfigs();
    }
  }, [user]);

  const handleSave = async () => {
    try {
      if (!user?.id) throw new Error("Not authenticated");
      const configToSave = configs[activeTab];
      const payload = {
        user_id: user.id,
        provider: configToSave.provider,
        api_key: configToSave.api_key,
        model_name: configToSave.model_name,
        is_enabled: configToSave.is_enabled,
      };

      const { error } = await supabase
        .from("llm_settings")
        .upsert(payload, { onConflict: "user_id,provider" });

      if (error) throw error;
      useToastStore.getState().success("Saved", `${activeTab.toUpperCase()} configuration saved.`);
    } catch (err: any) {
      useToastStore.getState().error("Save Failed", err.message);
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <Bot className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-bold text-white">AI Gateway Models</h3>
        </div>
      </div>

      <div className="flex gap-2 border-b border-white/5 mb-6">
        {Object.keys(configs).map((provider) => (
          <button
            key={provider}
            onClick={() => setActiveTab(provider)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-all ${
              activeTab === provider 
                ? "border-indigo-500 text-indigo-400" 
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {provider}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-400">API Key</label>
          <input
            type="password"
            value={configs[activeTab].api_key || ""}
            onChange={(e) => setConfigs({
              ...configs,
              [activeTab]: { ...configs[activeTab], api_key: e.target.value }
            })}
            placeholder="sk-..."
            className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-400">Model Name</label>
          <input
            type="text"
            value={configs[activeTab].model_name || ""}
            onChange={(e) => setConfigs({
              ...configs,
              [activeTab]: { ...configs[activeTab], model_name: e.target.value }
            })}
            className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 transition-all"
          />
        </div>

        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={handleSave}
            className="h-11 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs flex items-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" /> Save {activeTab} Config
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
