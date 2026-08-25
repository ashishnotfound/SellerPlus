"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bot, KeyRound, Loader2, Save, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { useToastStore } from "@/hooks/use-toast-store";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

const providers = ["openrouter", "nvidia", "gemini", "openai", "anthropic", "deepseek"] as const;
type Provider = (typeof providers)[number];

interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  modelName: string;
  enabled: boolean;
  priority: number;
  inputCostPerMillion: number | null;
  outputCostPerMillion: number | null;
  keyConfigured: boolean;
  fingerprint?: string;
}

function initialConfigs(): Record<Provider, ProviderConfig> {
  return Object.fromEntries(
    providers.map((provider, index) => [
      provider,
      {
        provider,
        apiKey: "",
        modelName: "",
        enabled: provider === "openrouter" || provider === "nvidia",
        priority: (index + 1) * 10,
        inputCostPerMillion: null,
        outputCostPerMillion: null,
        keyConfigured: false,
      },
    ]),
  ) as Record<Provider, ProviderConfig>;
}

export function LLMSettings() {
  const workspaceId = useAuth((state) => state.user?.workspaceId);
  const [configs, setConfigs] = useState(initialConfigs);
  const [activeTab, setActiveTab] = useState<Provider>("openrouter");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/ai-providers");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load AI providers.");

      setConfigs((current) => {
        const next = { ...current };
        for (const saved of payload.data as Array<{
          provider: Provider;
          keyConfigured: boolean;
          fingerprint?: string;
          modelName: string;
          enabled: boolean;
          priority: number;
          inputCostPerMillion: number | null;
          outputCostPerMillion: number | null;
        }>) {
          if (!providers.includes(saved.provider)) continue;
          next[saved.provider] = { ...next[saved.provider], ...saved, apiKey: "" };
        }
        return next;
      });
    } catch (error) {
      useToastStore.getState().error(
        "AI settings unavailable",
        error instanceof Error ? error.message : "Unable to load AI providers.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  const updateActive = (change: Partial<ProviderConfig>) => {
    setConfigs((current) => ({
      ...current,
      [activeTab]: { ...current[activeTab], ...change },
    }));
  };

  const handleSave = async () => {
    const config = configs[activeTab];
    if (!config.modelName.trim()) {
      useToastStore.getState().warning("Model required", "Enter the provider model identifier.");
      return;
    }
    if (!config.keyConfigured && !config.apiKey.trim()) {
      useToastStore.getState().warning("API key required", "Enter an API key for this provider.");
      return;
    }

    setSaving(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/ai-providers", {
        method: "PUT",
        body: JSON.stringify({
          provider: activeTab,
          apiKey: config.apiKey.trim() || undefined,
          modelName: config.modelName.trim(),
          enabled: config.enabled,
          priority: config.priority,
          inputCostPerMillion: config.inputCostPerMillion,
          outputCostPerMillion: config.outputCostPerMillion,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save this provider.");
      useToastStore.getState().success(
        "Provider saved",
        `${activeTab.toUpperCase()} is stored in the encrypted SellerPlus credential vault.`,
      );
      await loadConfigs();
    } catch (error) {
      useToastStore.getState().error(
        "Save failed",
        error instanceof Error ? error.message : "Unable to save this provider.",
      );
    } finally {
      setSaving(false);
    }
  };

  const active = configs[activeTab];

  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-2.5">
          <Bot className="w-5 h-5 text-indigo-400 mt-0.5" />
          <div>
            <h3 className="text-lg font-bold text-white">AI Model Router</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Configure independent providers. SellerPlus never returns stored API keys to the browser.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
          <ShieldCheck className="w-4 h-4" /> Encrypted
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-white/5 mb-6">
        {providers.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => setActiveTab(provider)}
            className={`px-3 py-2 text-xs font-semibold capitalize border-b-2 transition-colors whitespace-nowrap ${
              activeTab === provider
                ? "border-indigo-500 text-indigo-300"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {provider}
            {configs[provider].keyConfigured ? " •" : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-zinc-400">API key</span>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input
                type="password"
                autoComplete="new-password"
                value={active.apiKey}
                onChange={(event) => updateActive({ apiKey: event.target.value })}
                placeholder={active.keyConfigured
                  ? `Stored securely${active.fingerprint ? ` · ${active.fingerprint}` : ""}. Enter a new key to rotate.`
                  : "Enter provider API key"}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-400">Model identifier</span>
            <input
              type="text"
              value={active.modelName}
              onChange={(event) => updateActive({ modelName: event.target.value })}
              placeholder="Provider model ID"
              className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-400">Routing priority</span>
            <input
              type="number"
              min={1}
              max={100}
              value={active.priority}
              onChange={(event) => updateActive({ priority: Number(event.target.value) })}
              className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-400">Input cost / 1M tokens (USD)</span>
            <input
              type="number"
              min={0}
              step="0.000001"
              value={active.inputCostPerMillion ?? ""}
              onChange={(event) => updateActive({
                inputCostPerMillion: event.target.value === "" ? null : Number(event.target.value),
              })}
              placeholder="Required for monetary budgets"
              className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-400">Output cost / 1M tokens (USD)</span>
            <input
              type="number"
              min={0}
              step="0.000001"
              value={active.outputCostPerMillion ?? ""}
              onChange={(event) => updateActive({
                outputCostPerMillion: event.target.value === "" ? null : Number(event.target.value),
              })}
              placeholder="Use the provider's current model price"
              className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </label>

          <p className="text-[11px] text-zinc-500 md:col-span-2">
            SellerPlus does not guess model prices. Configure both rates from the provider&apos;s current pricing page before enabling a monetary AI budget.
          </p>

          <label className="flex items-center gap-2 text-xs text-zinc-300 md:col-span-2">
            <input
              type="checkbox"
              checked={active.enabled}
              onChange={(event) => updateActive({ enabled: event.target.checked })}
              className="accent-indigo-500"
            />
            Eligible for model routing and failover
          </label>

          <div className="flex justify-end md:col-span-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-11 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save provider
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
