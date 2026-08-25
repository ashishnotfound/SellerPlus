"use client";

import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { useConnections } from "@/hooks/use-connections";
import { WidgetRenderer } from "@/components/ui/widgets/WidgetRenderer";
import { RecommendationCard } from "@/components/ui/recommendation-card";
import { ExplainableRecommendation, Widget } from "@/lib/ai/schemas";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { PageHeader } from "@/components/page-header";
import { SkeletonLoader } from "@/components/skeleton-loader";
import { EmptyState } from "@/components/empty-state";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { GlassCard } from "@/components/glass-card";
import {
  RefreshCw,
  Activity,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

// ─── Dashboard Loading State ──────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <SkeletonLoader variant="page-header" />

      {/* AI loading card */}
      <GlassCard className="flex items-center gap-4 border-indigo-500/10 bg-indigo-500/[0.01]">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <p className="text-sm font-bold text-white">SellerPlus is calculating your verified operating snapshot…</p>
          <p className="text-xs text-zinc-500">Aggregating tenant-scoped orders, costs, advertising, and inventory.</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {[0, 0.2, 0.4].map((delay, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </div>
      </GlassCard>

      {/* KPI skeletons */}
      <SkeletonLoader variant="kpi" count={4} />

      {/* Chart skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonLoader key={i} variant="card" className="h-56" />
        ))}
      </div>

      {/* Recommendations skeletons */}
      <div className="flex flex-col gap-3">
        <SkeletonLoader variant="page-header" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <SkeletonLoader key={i} variant="card" className="h-40" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Error State ────────────────────────────────────────────

function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Executive Dashboard"
        description="AI-powered business intelligence for your Amazon store."
      />
      <GlassCard className="border-rose-500/10 bg-rose-500/[0.01]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white mb-1">AI Analysis Failed</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              The BI Engine could not complete the analysis. This can happen when no Amazon account is connected or there is insufficient historical data.
            </p>
          </div>
          <button
            onClick={onRetry}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

// ─── Dashboard Empty State ────────────────────────────────────────────

function DashboardEmpty({ onRefresh, amazonConnected }: { onRefresh: () => void, amazonConnected: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Executive Dashboard"
        description="Your verified seller operating overview. Connect an Amazon account to get started."
      />
      <OnboardingBanner
        steps={{
          amazonConnected,
          costProfileAdded: false,
          aiChatUsed: false,
        }}
      />
      <EmptyState
        size="lg"
        icon={<Activity className="w-10 h-10" />}
        title="No Data Available Yet"
        description="SellerPlus needs marketplace data to calculate the operating snapshot. Connect Amazon and run the initial synchronization."
        action={{ label: "Go to Settings", href: "/settings" }}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  const amazonConnected = useConnections((s) => s.amazonConnected);

  const {
    data: biData,
    isLoading,
    isError,
    refetch,
    isRefetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["bi-dashboard", user?.id, user?.workspaceId],
    queryFn: async () => {
      const res = await sellerplusApiFetch("/api/ai/bi", {
        method: "POST",
        body: JSON.stringify({
          mode: "Executive Summary",
          goal: "Provide a high-level overview of business health, key metrics, and urgent recommendations.",
        }),
      });
      if (!res.ok) throw new Error("Failed to load the verified operating snapshot.");

      const bi = await res.json() as {
        summary: string;
        widgets: Widget[];
        recommendations: ExplainableRecommendation[];
      };

      return bi;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    retry: 1,
  });

  const { data: onboardingState } = useQuery({
    queryKey: ["onboarding", user?.id, user?.workspaceId],
    queryFn: async () => {
      const response = await sellerplusApiFetch("/api/onboarding/status");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Onboarding status is unavailable.");
      return payload.data as { costProfileAdded: boolean; aiChatUsed: boolean };
    },
    enabled: !!user?.id && !!user?.workspaceId,
  });

  if (isLoading || isRefetching) return <DashboardSkeleton />;
  if (isError) return <DashboardError onRetry={refetch} />;
  if (!biData || (biData.widgets.length === 0 && biData.recommendations.length === 0)) {
    return <DashboardEmpty onRefresh={refetch} amazonConnected={amazonConnected} />;
  }

  const kpiWidgets = biData.widgets.filter((w) => w.type === "KPI");
  let chartWidgets = biData.widgets.filter((w) => w.type !== "KPI");

  chartWidgets = chartWidgets.sort((a, b) => (a.importance === "High" ? -1 : b.importance === "High" ? 1 : 0));

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  const costProfileAdded = onboardingState?.costProfileAdded ?? false;
  const aiChatUsed = onboardingState?.aiChatUsed ?? false;
  const showBanner = !amazonConnected || !costProfileAdded || !aiChatUsed;

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Executive Dashboard"
        description={biData.summary}
        action={
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/[0.07] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh AI Audit
          </button>
        }
      />

      {/* Last updated */}
      {lastUpdated && (
        <div className="flex items-center gap-1.5 -mt-4">
          <Sparkles className="w-3 h-3 text-indigo-400" />
          <span className="text-[11px] text-zinc-600">
            Operating snapshot updated at <span className="text-zinc-500">{lastUpdated}</span>
          </span>
        </div>
      )}

      {/* Onboarding Banner — shown until all steps complete */}
      {showBanner && (
        <OnboardingBanner
          steps={{
            amazonConnected: amazonConnected,
            costProfileAdded: costProfileAdded,
            aiChatUsed: aiChatUsed,
          }}
        />
      )}

      {/* KPI Grid */}
      {kpiWidgets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiWidgets.map((widget) => (
            <WidgetRenderer key={widget.id} widget={widget} />
          ))}
        </div>
      )}

      {/* Charts & Tables */}
      {chartWidgets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {chartWidgets.map((widget) => (
            <div key={widget.id} className={widget.importance === "High" ? "lg:col-span-2" : ""}>
              <WidgetRenderer widget={widget} />
            </div>
          ))}
        </div>
      )}

      {/* AI Recommendations */}
      {biData.recommendations.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Verified Action Items</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {biData.recommendations.length} recommendation{biData.recommendations.length !== 1 ? "s" : ""} found — sorted by priority
              </p>
            </div>
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
              Top {Math.min(4, biData.recommendations.length)} shown
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {biData.recommendations.slice(0, 4).map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
