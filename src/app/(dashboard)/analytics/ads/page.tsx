"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart4,
  Briefcase,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Settings,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { useToastStore } from "@/hooks/use-toast-store";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { cn, formatCurrency } from "@/lib/utils";

interface CampaignRecord {
  campaign_id: string;
  name: string;
  status: string;
  budget: number;
  bid_strategy: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  synced_at: string | null;
  currency_code: string;
}

interface AdsOverview {
  dataAvailable: boolean;
  dataWindow: { since: string; until: string; timezone: string };
  source: string;
  sourceUpdatedAt: string | null;
  earliestAvailableDate: string | null;
  latestAvailableDate: string | null;
  summary: { spend: number; sales: number; impressions: number; clicks: number; orders: number; campaigns: number };
  totalCampaigns: number;
}

interface JobState {
  id: string;
  status: string;
  progress: number;
  last_error: string | null;
}

export default function PpcAdsAnalyticsPage() {
  const user = useAuth((state) => state.user);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [overview, setOverview] = useState<AdsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [days, setDays] = useState<7 | 14 | 30>(30);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const apiRequest = useCallback(async (path: string, init?: RequestInit) => {
    const response = await sellerplusApiFetch(path, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Advertising request failed.");
    return body;
  }, []);

  const loadCampaigns = useCallback(async () => {
    if (!user?.workspaceId) return;
    setLoading(true);
    try {
      const body = await apiRequest(`/api/advertising/overview?days=${days}&page=${page}&limit=${pageSize}`);
      setCampaigns((body.data?.campaigns ?? []) as CampaignRecord[]);
      setOverview(body.data as AdsOverview);
    } catch (error) {
      useToastStore.getState().error("Campaign data unavailable", error instanceof Error ? error.message : "Try again later.");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, days, page, user?.workspaceId]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (!job || ["completed", "failed", "canceled"].includes(job.status)) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      let payload;
      try {
        payload = await apiRequest(`/api/jobs/${job.id}`);
      } catch (error) {
        if (!active) return;
        setSyncing(false);
        useToastStore.getState().error("Sync status unavailable", error instanceof Error ? error.message : "Unable to read the background job.");
        return;
      }
      if (!active) return;
      const next = payload.data as JobState;
      setJob(next);
      if (next.status === "completed") {
        setSyncing(false);
        await loadCampaigns();
        useToastStore.getState().success("Ads sync complete", "Amazon campaign performance is up to date.");
      } else if (["failed", "canceled"].includes(next.status)) {
        setSyncing(false);
        useToastStore.getState().error("Ads sync stopped", next.last_error ?? "The background job did not complete.");
      }
    }, 5_000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [apiRequest, job, loadCampaigns]);

  const startSync = async () => {
    setSyncing(true);
    try {
      const payload = await apiRequest("/api/amazon/sync-ads", { method: "POST", body: "{}" });
      setJob({ id: payload.data.jobId, status: payload.data.status, progress: 0, last_error: null });
      useToastStore.getState().success("Ads sync queued", "SellerPlus will import daily report facts in the background.");
    } catch (error) {
      setSyncing(false);
      useToastStore.getState().error("Ads sync could not start", error instanceof Error ? error.message : "Check the Amazon Ads connection in Settings.");
    }
  };

  const summary = useMemo(() => {
    const spend = Number(overview?.summary.spend ?? 0);
    const sales = Number(overview?.summary.sales ?? 0);
    const impressions = Number(overview?.summary.impressions ?? 0);
    const clicks = Number(overview?.summary.clicks ?? 0);
    return {
      spend,
      sales,
      acos: sales > 0 ? (spend / sales) * 100 : 0,
      roas: spend > 0 ? sales / spend : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
  }, [overview]);

  const chartData = useMemo(
    () => campaigns.slice(0, 20).map((campaign) => ({
      name: campaign.name.length > 18 ? `${campaign.name.slice(0, 18)}…` : campaign.name,
      adSales: Number(campaign.sales),
      adSpend: Number(campaign.spend),
    })),
    [campaigns],
  );

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2" role="status">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Loading Amazon Ads</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-white">
            <TrendingUp className="h-7 w-7 text-indigo-400" />
            Sponsored Ads Manager
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Amazon-sourced campaign performance, spend efficiency, and conversion health.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {([7, 14, 30] as const).map((value) => (
              <button key={value} type="button" onClick={() => { setDays(value); setPage(1); }} className={cn("h-8 rounded-md px-2.5 text-xs font-bold", days === value ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}>
                {value}d
              </button>
            ))}
          </div>
          <Link href="/settings" className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3.5 text-xs font-bold text-zinc-300 hover:bg-white/5">
            <Settings className="h-3.5 w-3.5" /> Connection
          </Link>
          <button
            type="button"
            onClick={startSync}
            disabled={syncing}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 text-xs font-bold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? `Syncing ${Math.round(job?.progress ?? 0)}%` : "Sync Amazon Ads"}
          </button>
        </div>
      </div>

      {job && !["completed", "failed", "canceled"].includes(job.status) && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-xs text-indigo-200" role="status">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Amazon is preparing the report. This job is durable and continues if you leave this page.
        </div>
      )}

      {campaigns.length === 0 ? (
        <GlassCard className="mx-auto flex max-w-2xl flex-col items-center p-8 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10">
            <BarChart4 className="h-7 w-7 text-indigo-400" />
          </div>
          <h2 className="text-xl font-bold text-white">No Amazon Ads data yet</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
            No daily Amazon Ads facts are available for the selected {days}-day window. Configure an authorized Ads account, then run a sync.
          </p>
          <div className="mt-6 flex gap-2">
            <Link href="/settings" className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold text-zinc-200 hover:bg-white/5">Open settings</Link>
            <button type="button" onClick={startSync} disabled={syncing} className="rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Try sync</button>
          </div>
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Ad spend", formatCurrency(summary.spend), "text-rose-400"],
              ["Ad sales", formatCurrency(summary.sales), "text-emerald-400"],
              ["ACOS", `${summary.acos.toFixed(1)}%`, "text-indigo-400"],
              ["ROAS", `${summary.roas.toFixed(2)}x`, "text-amber-400"],
              ["CTR", `${summary.ctr.toFixed(2)}%`, "text-zinc-200"],
              ["Avg CPC", formatCurrency(summary.cpc), "text-zinc-200"],
            ].map(([label, value, color]) => (
              <GlassCard key={label} className="flex flex-col justify-between p-4">
                <span className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-zinc-500">
                  {label}
                  {label === "ACOS" && <HelpCircle className="h-2.5 w-2.5" aria-label="Advertising cost of sales" />}
                </span>
                <span className={cn("mt-1 text-lg font-black", color)}>{value}</span>
              </GlassCard>
            ))}
          </div>

          <GlassCard className="p-6">
            <h2 className="text-sm font-bold text-white">Top campaigns by spend</h2>
            <p className="mb-4 text-xs text-zinc-600">
              Amazon Ads API v3 daily facts · {overview?.dataWindow.since} to {overview?.dataWindow.until}
              {overview?.sourceUpdatedAt ? ` · synced ${new Date(overview.sourceUpdatedAt).toLocaleString()}` : ""}
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="#52525b" fontSize={9} />
                  <YAxis stroke="#52525b" fontSize={9} />
                  <Tooltip contentStyle={{ backgroundColor: "#0e0e12", borderColor: "rgba(255,255,255,0.1)", borderRadius: 12 }} />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Ad sales" dataKey="adSales" fill="#00c48c" radius={[4, 4, 0, 0]} />
                  <Bar name="Ad spend" dataKey="adSpend" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-indigo-400" />
              <h2 className="text-sm font-bold text-white">Campaign performance</h2>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Amazon sourced</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[850px] w-full text-left text-xs">
                <thead><tr className="h-10 border-b border-white/5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th>Campaign</th><th>Status</th><th className="text-right">Impressions</th><th className="text-right">Clicks</th><th className="text-right">CTR</th><th className="text-right">CPC</th><th className="text-right">Spend</th><th className="text-right">Sales</th><th className="text-right">ACOS</th><th className="text-right">Orders</th>
                </tr></thead>
                <tbody className="divide-y divide-white/5 text-zinc-300">
                  {campaigns.map((campaign) => {
                    const ctr = campaign.impressions > 0 ? (campaign.clicks / campaign.impressions) * 100 : 0;
                    const acos = campaign.sales > 0 ? (campaign.spend / campaign.sales) * 100 : 0;
                    return <tr key={campaign.campaign_id} className="h-14 hover:bg-white/[0.01]">
                      <td className="max-w-[260px] truncate font-bold text-white">{campaign.name}</td>
                      <td><span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold", campaign.status === "ENABLED" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-zinc-500/20 bg-zinc-500/10 text-zinc-500")}>{campaign.status}</span></td>
                      <td className="text-right font-mono">{campaign.impressions.toLocaleString()}</td>
                      <td className="text-right font-mono">{campaign.clicks.toLocaleString()}</td>
                      <td className="text-right">{ctr.toFixed(2)}%</td>
                      <td className="text-right font-mono">{formatCurrency(campaign.clicks > 0 ? campaign.spend / campaign.clicks : 0)}</td>
                      <td className="text-right font-mono font-bold text-rose-400">{formatCurrency(campaign.spend)}</td>
                      <td className="text-right font-mono font-bold text-emerald-400">{formatCurrency(campaign.sales)}</td>
                      <td className="text-right font-bold text-indigo-400">{acos.toFixed(1)}%</td>
                      <td className="text-right font-mono font-bold">{campaign.orders}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {(overview?.totalCampaigns ?? 0) > pageSize && (
              <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4 text-xs text-zinc-500">
                <span>Page {page} of {Math.ceil((overview?.totalCampaigns ?? 0) / pageSize)} · {overview?.totalCampaigns} campaigns</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md border border-white/10 px-3 py-1.5 text-zinc-300 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={page * pageSize >= (overview?.totalCampaigns ?? 0)} onClick={() => setPage((value) => value + 1)} className="rounded-md border border-white/10 px-3 py-1.5 text-zinc-300 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
