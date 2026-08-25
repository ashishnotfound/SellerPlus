"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, Loader2, Save, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";
import { useToastStore } from "@/hooks/use-toast-store";

interface BudgetPolicy {
  enabled: boolean;
  version: number | null;
  dailyCostLimitUsd: number | null;
  monthlyCostLimitUsd: number | null;
  dailyTokenLimit: number | null;
  monthlyTokenLimit: number | null;
  requireKnownCost: boolean;
}

const emptyPolicy: BudgetPolicy = {
  enabled: false,
  version: null,
  dailyCostLimitUsd: null,
  monthlyCostLimitUsd: null,
  dailyTokenLimit: null,
  monthlyTokenLimit: null,
  requireKnownCost: true,
};

export function AIBudgetSettings() {
  const workspaceId = useAuth((state) => state.user?.workspaceId);
  const [policy, setPolicy] = useState<BudgetPolicy>(emptyPolicy);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/ai-budget");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load the AI budget policy.");
      setPolicy(payload.data as BudgetPolicy);
    } catch (error) {
      useToastStore.getState().error(
        "AI budget unavailable",
        error instanceof Error ? error.message : "Unable to load the AI budget policy.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/ai-budget", {
        method: "PUT",
        body: JSON.stringify({
          enabled: policy.enabled,
          expectedVersion: policy.version,
          dailyCostLimitUsd: policy.dailyCostLimitUsd,
          monthlyCostLimitUsd: policy.monthlyCostLimitUsd,
          dailyTokenLimit: policy.dailyTokenLimit,
          monthlyTokenLimit: policy.monthlyTokenLimit,
          requireKnownCost: policy.requireKnownCost,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save the AI budget policy.");
      useToastStore.getState().success(
        policy.enabled ? "AI budget enforced" : "AI budget disabled",
        policy.enabled
          ? "SellerPlus will reserve budget before each external model request."
          : "Workspace AI requests no longer have a configured budget cap.",
      );
      await loadPolicy();
    } catch (error) {
      useToastStore.getState().error(
        "Budget not saved",
        error instanceof Error ? error.message : "Unable to save the AI budget policy.",
      );
    } finally {
      setSaving(false);
    }
  };

  const numberField = (
    key: "dailyCostLimitUsd" | "monthlyCostLimitUsd" | "dailyTokenLimit" | "monthlyTokenLimit",
    label: string,
    step: string,
  ) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-zinc-400">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        disabled={!policy.enabled}
        value={policy[key] ?? ""}
        onChange={(event) => setPolicy((current) => ({
          ...current,
          [key]: event.target.value === "" ? null : Number(event.target.value),
        }))}
        placeholder="No limit"
        className="h-11 rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm text-white focus:border-indigo-500 focus:outline-none disabled:opacity-40"
      />
    </label>
  );

  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-2.5">
          <CircleDollarSign className="w-5 h-5 text-indigo-400 mt-0.5" />
          <div>
            <h3 className="text-lg font-bold text-white">Workspace AI Budget</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Server-enforced daily or monthly caps with transactional reservations for concurrent requests.
            </p>
          </div>
        </div>
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-200 md:col-span-2">
            <input
              type="checkbox"
              checked={policy.enabled}
              onChange={(event) => setPolicy((current) => ({ ...current, enabled: event.target.checked }))}
              className="accent-indigo-500"
            />
            Enforce an AI budget for this workspace
          </label>

          {numberField("dailyCostLimitUsd", "Daily cost limit (USD)", "0.01")}
          {numberField("monthlyCostLimitUsd", "Monthly cost limit (USD)", "0.01")}
          {numberField("dailyTokenLimit", "Daily token limit", "1")}
          {numberField("monthlyTokenLimit", "Monthly token limit", "1")}

          <label className="flex items-start gap-2 text-xs text-zinc-300 md:col-span-2">
            <input
              type="checkbox"
              disabled={!policy.enabled}
              checked={policy.requireKnownCost}
              onChange={(event) => setPolicy((current) => ({ ...current, requireKnownCost: event.target.checked }))}
              className="mt-0.5 accent-indigo-500"
            />
            Block models without configured pricing whenever a monetary cap is active. This prevents unknown provider costs from bypassing the limit.
          </label>

          <div className="flex justify-end md:col-span-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-11 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save budget policy
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
