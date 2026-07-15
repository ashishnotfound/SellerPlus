"use client";

import React, { useState, useEffect, useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import { useToastStore } from "@/hooks/use-toast-store";
import { useAuth } from "@/hooks/use-auth";
import { useConnections } from "@/hooks/use-connections";
import { 
  TrendingUp, Percent, MousePointerClick, Eye, BarChart4, Briefcase, 
  HelpCircle, Settings, ShieldAlert, Sparkles, CheckCircle, RefreshCw, Key, Link2
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";
import { supabase } from "@/lib/supabase";
import { cn, formatCurrency } from "@/lib/utils";

interface CampaignRecord {
  id: string;
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
  clicks_through_rate: number;
  cost_per_click: number;
}

export default function PpcAdsAnalyticsPage() {
  const user = useAuth((s) => s.user);
  
  // Credentials input state for wizard
  const [adsClientId, setAdsClientId] = useState(
    typeof window !== "undefined" ? (localStorage.getItem("sp_ads_client_id") || "") : ""
  );
  const [adsClientSecret, setAdsClientSecret] = useState(
    typeof window !== "undefined" ? (localStorage.getItem("sp_ads_client_secret") || "") : ""
  );
  const [adsRefreshToken, setAdsRefreshToken] = useState(
    typeof window !== "undefined" ? (localStorage.getItem("sp_ads_refresh_token") || "") : ""
  );
  const [adsProfileId, setAdsProfileId] = useState(
    typeof window !== "undefined" ? (localStorage.getItem("sp_ads_profile_id") || "") : ""
  );

  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  // Load campaigns from Supabase
  const loadCampaigns = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("advertising_campaigns")
        .select("*")
        .eq("user_id", user.id);
      if (!error && data) {
        setCampaigns(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, [user?.id]);

  const handleConnectAds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!adsClientId || !adsClientSecret || !adsRefreshToken || !adsProfileId) {
      useToastStore.getState().warning("Missing Input", "Please complete all integration keys inside the form fields.");
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch("/api/amazon/sync-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          clientId: adsClientId,
          clientSecret: adsClientSecret,
          refreshToken: adsRefreshToken,
          profileId: adsProfileId
        })
      });

      const data = await res.json();
      if (data.success) {
        if (typeof window !== "undefined") {
          localStorage.setItem("sp_ads_client_id", adsClientId);
          localStorage.setItem("sp_ads_client_secret", adsClientSecret);
          localStorage.setItem("sp_ads_refresh_token", adsRefreshToken);
          localStorage.setItem("sp_ads_profile_id", adsProfileId);
        }
        await loadCampaigns();
        setShowConfigPanel(false);
        useToastStore.getState().success("Integration Authorized", "Amazon Advertising API authorized successfully! Campaign metrics loaded.");
      } else {
        useToastStore.getState().error("Authorization Failed", data.error);
      }
    } catch (err: any) {
      useToastStore.getState().error("Integration Error", "Integration sync crashed: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnectAds = async () => {
    if (!window.confirm("Are you sure you want to disconnect your Amazon Ads profile?")) return;
    if (!user?.id) return;
    try {
      await supabase
        .from("advertising_campaigns")
        .delete()
        .eq("user_id", user.id);
      
      if (typeof window !== "undefined") {
        localStorage.removeItem("sp_ads_client_id");
        localStorage.removeItem("sp_ads_client_secret");
        localStorage.removeItem("sp_ads_refresh_token");
        localStorage.removeItem("sp_ads_profile_id");
      }
      setCampaigns([]);
    } catch (e: any) {
      useToastStore.getState().error("Refresh Failed", e.message);
    }
  };

  // Summarize KPIs
  const summary = useMemo(() => {
    const totalSpend = campaigns.reduce((sum, c) => sum + Number(c.spend || 0), 0);
    const totalSales = campaigns.reduce((sum, c) => sum + Number(c.sales || 0), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const totalOrders = campaigns.reduce((sum, c) => sum + (c.orders || 0), 0);

    const acos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0;
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

    return {
      spend: totalSpend,
      sales: totalSales,
      acos,
      roas,
      ctr,
      cpc,
      impressions: totalImpressions,
      clicks: totalClicks,
      orders: totalOrders
    };
  }, [campaigns]);

  // Visual graph formatting
  const chartData = useMemo(() => {
    return campaigns.map(c => ({
      name: c.name.length > 15 ? c.name.slice(0, 15) + "..." : c.name,
      adSales: c.sales,
      adSpend: c.spend
    }));
  }, [campaigns]);

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-2">
        <div className="w-6 h-6 border-t-2 border-indigo-500 border-solid rounded-full animate-spin" />
        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Connecting Amazon Advertising Services...</span>
      </div>
    );
  }

  // Connection Wizard if empty
  if (campaigns.length === 0 && !showConfigPanel) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <GlassCard className="p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-6">
            <Link2 className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Connect Amazon Advertising</h2>
          <p className="text-zinc-400 text-xs max-w-md leading-relaxed mb-6">
            Import active PPC campaigns, dynamic keyword spend logs, CTR performance records, and target ACOS directly from the Selling Partner Advertising API.
          </p>

          <button
            onClick={() => setShowConfigPanel(true)}
            className="h-10 px-6 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs transition-all flex items-center gap-2"
          >
            <Settings className="w-4 h-4" /> Start Ads Integration Wizard
          </button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-indigo-400" />
            Sponsored Ads Manager
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Real campaigns diagnostics, ACOS breakdowns, CTR conversions, and target budgets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfigPanel(true)}
            className="h-9 px-3.5 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/5 text-zinc-300 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" /> Reconfigure keys
          </button>
          <button
            onClick={handleDisconnectAds}
            className="h-9 px-3.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all"
          >
            Disconnect Account
          </button>
        </div>
      </div>

      {/* Integration form state */}
      {showConfigPanel && (
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><Key className="w-4 h-4 text-indigo-400" /> Advertising API Setup</h3>
            <button onClick={() => setShowConfigPanel(false)} className="text-zinc-500 hover:text-white">×</button>
          </div>
          <form onSubmit={handleConnectAds} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase font-bold">LWA Client ID</span>
              <input
                type="text"
                value={adsClientId}
                onChange={(e) => setAdsClientId(e.target.value)}
                placeholder="amzn1.application-oa2-client..."
                className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white placeholder-zinc-700 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase font-bold">LWA Client Secret</span>
              <input
                type="password"
                value={adsClientSecret}
                onChange={(e) => setAdsClientSecret(e.target.value)}
                placeholder="••••••••••••••••"
                className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white placeholder-zinc-700 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase font-bold">LWA Refresh Token</span>
              <input
                type="text"
                value={adsRefreshToken}
                onChange={(e) => setAdsRefreshToken(e.target.value)}
                placeholder="Atzr|IQEBLzAtAhRP..."
                className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white placeholder-zinc-700 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase font-bold">Ads Profile ID</span>
              <input
                type="text"
                value={adsProfileId}
                onChange={(e) => setAdsProfileId(e.target.value)}
                placeholder="amzn1.ads1.pro1..."
                className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white placeholder-zinc-700 focus:outline-none"
              />
            </div>
            <div className="col-span-1 md:col-span-2 flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowConfigPanel(false)}
                className="h-9 px-4 rounded-lg border border-white/10 text-zinc-400 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSyncing}
                className="h-9 px-5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-all flex items-center gap-1.5"
              >
                {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Authorize & Sync Ads"}
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider">Ad Spend</span>
          <span className="text-lg font-black text-rose-400 mt-1">{formatCurrency(summary.spend)}</span>
        </GlassCard>
        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider">Ad Sales</span>
          <span className="text-lg font-black text-[#00c48c] mt-1">{formatCurrency(summary.sales)}</span>
        </GlassCard>
        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider flex items-center gap-0.5">
            ACOS <span title="Advertising Cost of Sales (Spend/Ad Sales)"><HelpCircle className="w-2.5 h-2.5 text-zinc-600" /></span>
          </span>
          <span className="text-lg font-black text-indigo-400 mt-1">{summary.acos.toFixed(1)}%</span>
        </GlassCard>
        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider">ROAS</span>
          <span className="text-lg font-black text-amber-400 mt-1">{summary.roas.toFixed(2)}x</span>
        </GlassCard>
        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider">CTR %</span>
          <span className="text-lg font-black text-zinc-200 mt-1">{summary.ctr.toFixed(2)}%</span>
        </GlassCard>
        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider">Avg CPC</span>
          <span className="text-lg font-black text-zinc-200 mt-1">{formatCurrency(summary.cpc)}</span>
        </GlassCard>
      </div>

      {/* Chart: Spend vs Sales */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Campaign performance visualization</h3>
            <p className="text-xs text-zinc-600">PPC spend vs generated sales velocity</p>
          </div>
        </div>

        <div className="h-64 w-full">
          {chartData.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
              <span className="text-zinc-500 font-bold mb-2">No timeline data available</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#52525b" fontSize={9} />
                <YAxis stroke="#52525b" fontSize={9} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0E0E12", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }}
                  itemStyle={{ fontSize: "12px" }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px" }} />
                <Bar name="PPC Sales Value" dataKey="adSales" fill="#00c48c" radius={[4, 4, 0, 0]} />
                <Bar name="Ad Spend Cost" dataKey="adSpend" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlassCard>

      {/* Campaigns list table */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase className="w-5 h-5 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Active Campaigns Dashboard</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[750px]">
            <thead>
              <tr className="border-b border-white/5 text-zinc-500 font-semibold h-10 uppercase tracking-wider text-[10px]">
                <th>Campaign name</th>
                <th>Bid Strategy</th>
                <th className="text-right">Impressions</th>
                <th className="text-right">Clicks</th>
                <th className="text-right">CTR %</th>
                <th className="text-right">CPC Cost</th>
                <th className="text-right">Total Spend</th>
                <th className="text-right">Ad Sales</th>
                <th className="text-right">ACOS</th>
                <th className="text-right">Conversions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium text-zinc-300">
              {campaigns.map((c) => {
                const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
                const acos = c.sales > 0 ? (c.spend / c.sales) * 100 : 0;
                return (
                  <tr key={c.id} className="h-14 hover:bg-white/[0.01] transition-colors">
                    <td>
                      <div className="flex flex-col py-1">
                        <span className="font-bold text-white">{c.name}</span>
                        <span className={cn(
                          "text-[9px] uppercase font-bold px-1.5 py-0.5 rounded w-max mt-1 leading-none border",
                          c.status === "ENABLED"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : "bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
                        )}>
                          {c.status}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-zinc-500 text-[10px] font-mono">{c.bid_strategy}</span>
                    </td>
                    <td className="text-right font-mono text-zinc-400">{c.impressions.toLocaleString()}</td>
                    <td className="text-right font-mono text-zinc-400">{c.clicks.toLocaleString()}</td>
                    <td className="text-right text-zinc-300">{ctr.toFixed(2)}%</td>
                    <td className="text-right font-mono text-zinc-300">{formatCurrency(c.cost_per_click)}</td>
                    <td className="text-right text-rose-400 font-mono font-bold">-{formatCurrency(c.spend)}</td>
                    <td className="text-right text-[#00c48c] font-mono font-bold">{formatCurrency(c.sales)}</td>
                    <td className="text-right text-indigo-400 font-bold">{acos.toFixed(1)}%</td>
                    <td className="text-right text-emerald-400 font-bold font-mono">{c.orders}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
