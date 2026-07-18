"use client";

import React, { useState, useEffect, useCallback } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";
import {
  Link2,
  Link2Off,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = "sp" | "ads";

interface TokenRow {
  id: string;
  provider: Provider;
  expires_at: string;
  scope: string | null;
}

// ─── Amazon OAuth helpers ──────────────────────────────────────────────────────

const AMAZON_AUTH_BASE =
  "https://sellercentral.amazon.com/apps/authorize/consent";
const AMAZON_ADS_AUTH_BASE =
  "https://www.amazon.com/ap/oa";

const SP_SCOPE = "sellingpartnerapi::notifications sellingpartnerapi::migration";
const ADS_SCOPE = "advertising::campaign_management";

function buildOAuthUrl(provider: Provider): string {
  const params = new URLSearchParams({
    application_id:
      provider === "sp"
        ? process.env.NEXT_PUBLIC_AMAZON_SP_CLIENT_ID ?? ""
        : process.env.NEXT_PUBLIC_AMAZON_ADS_CLIENT_ID ?? "",
    redirect_uri: `${window.location.origin}/api/amazon/callback`,
    state: `${provider}:${crypto.randomUUID()}`,
    ...(provider === "ads" && {
      client_id:
        process.env.NEXT_PUBLIC_AMAZON_ADS_CLIENT_ID ?? "",
      scope: ADS_SCOPE,
      response_type: "code",
    }),
  });

  const base =
    provider === "sp" ? AMAZON_AUTH_BASE : AMAZON_ADS_AUTH_BASE;

  return `${base}?${params.toString()}`;
}

// ─── Sub-component: API Card ───────────────────────────────────────────────────

interface ApiCardProps {
  provider: Provider;
  token: TokenRow | null;
  loading: boolean;
  onConnect: (provider: Provider) => void;
  onDisconnect: (id: string) => void;
}

function ApiCard({
  provider,
  token,
  loading,
  onConnect,
  onDisconnect,
}: ApiCardProps) {
  const isConnected = !!token;
  const expiresAt = token ? new Date(token.expires_at) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;
  const label = provider === "sp" ? "Amazon SP API" : "Amazon Ads API";
  const Icon = provider === "sp" ? ShoppingCart : TrendingUp;
  const accentColor =
    provider === "sp"
      ? "from-orange-500/20 to-orange-600/10 border-orange-500/30"
      : "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30";
  const btnColor =
    provider === "sp"
      ? "bg-orange-500 hover:bg-orange-600"
      : "bg-yellow-500 hover:bg-yellow-600";
  const iconColor =
    provider === "sp" ? "text-orange-400" : "text-yellow-400";

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-5 transition-all ${accentColor}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10`}
        >
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">{label}</p>
          <p className="text-xs text-zinc-400">
            {provider === "sp"
              ? "Access orders, listings & inventory via Amazon Selling Partner"
              : "Manage & fetch Sponsored Products, Brands and Display campaigns"}
          </p>
        </div>

        {/* Status badge */}
        {isConnected && !isExpired && (
          <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
            <CheckCircle2 className="w-3 h-3" /> Connected
          </span>
        )}
        {isConnected && isExpired && (
          <span className="flex items-center gap-1 text-amber-400 text-xs font-semibold bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
            <AlertCircle className="w-3 h-3" /> Expired
          </span>
        )}
        {!isConnected && !loading && (
          <span className="flex items-center gap-1 text-zinc-500 text-xs font-semibold bg-zinc-700/30 border border-white/5 rounded-full px-2.5 py-0.5">
            Not Connected
          </span>
        )}
      </div>

      {/* Token metadata */}
      {isConnected && (
        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white/[0.04] rounded-xl px-3 py-2">
            <p className="text-zinc-500 mb-0.5">Expires</p>
            <p className="text-zinc-200 font-medium truncate">
              {expiresAt?.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          {token?.scope && (
            <div className="bg-white/[0.04] rounded-xl px-3 py-2 col-span-1">
              <p className="text-zinc-500 mb-0.5">Scopes</p>
              <p className="text-zinc-200 font-medium truncate">{token.scope}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {!isConnected ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => onConnect(provider)}
            className={`flex-1 h-10 rounded-xl ${btnColor} text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                Connect {provider === "sp" ? "SP API" : "Ads API"}
              </>
            )}
          </button>
        ) : (
          <>
            {isExpired && (
              <button
                type="button"
                onClick={() => onConnect(provider)}
                className={`flex-1 h-10 rounded-xl ${btnColor} text-white font-bold text-xs flex items-center justify-center gap-2 transition-all`}
              >
                <RefreshCw className="w-4 h-4" />
                Reconnect
              </button>
            )}
            <button
              type="button"
              onClick={() => onDisconnect(token!.id)}
              className="h-10 px-4 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs flex items-center gap-1.5 transition-all"
            >
              <Link2Off className="w-4 h-4" />
              Disconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function AmazonAPISettings() {
  const user = useAuth((s) => s.user);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Provider | null>(null);

  const fetchTokens = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("amazon_user_tokens")
      .select("id, provider, expires_at, scope")
      .eq("supabase_user_id", user.id);

    if (!error && data) setTokens(data as TokenRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Listen for callback success via URL params
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("amazon_connected")) {
      useToastStore
        .getState()
        .success("Amazon Connected", "Your Amazon account has been linked.");
      url.searchParams.delete("amazon_connected");
      window.history.replaceState({}, "", url.toString());
      fetchTokens();
    }
  }, [fetchTokens]);

  const handleConnect = (provider: Provider) => {
    if (!process.env.NEXT_PUBLIC_AMAZON_SP_CLIENT_ID && provider === "sp") {
      useToastStore
        .getState()
        .error(
          "Not Configured",
          "NEXT_PUBLIC_AMAZON_SP_CLIENT_ID is missing from environment variables."
        );
      return;
    }
    if (!process.env.NEXT_PUBLIC_AMAZON_ADS_CLIENT_ID && provider === "ads") {
      useToastStore
        .getState()
        .error(
          "Not Configured",
          "NEXT_PUBLIC_AMAZON_ADS_CLIENT_ID is missing from environment variables."
        );
      return;
    }
    setConnecting(provider);
    const url = buildOAuthUrl(provider);
    window.location.href = url;
  };

  const handleDisconnect = async (id: string) => {
    const { error } = await supabase
      .from("amazon_user_tokens")
      .delete()
      .eq("id", id);

    if (error) {
      useToastStore.getState().error("Error", "Failed to disconnect. " + error.message);
    } else {
      useToastStore.getState().success("Disconnected", "Amazon account unlinked.");
      fetchTokens();
    }
  };

  const spToken = tokens.find((t) => t.provider === "sp") ?? null;
  const adsToken = tokens.find((t) => t.provider === "ads") ?? null;

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          {/* Amazon-style smile icon using unicode */}
          <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
            <span className="text-orange-400 text-sm font-black">A</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Amazon API Connections</h3>
            <p className="text-xs text-zinc-500">
              Connect your Amazon accounts to sync orders, listings, and ad campaigns.
            </p>
          </div>
        </div>

        {(spToken || adsToken) && (
          <button
            type="button"
            onClick={fetchTokens}
            className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center text-zinc-400 hover:text-white transition-all"
            title="Refresh status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* API Cards */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center items-center h-24">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <>
            <ApiCard
              provider="sp"
              token={spToken}
              loading={connecting === "sp"}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
            <ApiCard
              provider="ads"
              token={adsToken}
              loading={connecting === "ads"}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          </>
        )}
      </div>

      {/* Info footer */}
      <p className="mt-5 text-xs text-zinc-600 text-center">
        Credentials are stored encrypted in Supabase and never sent to the client.
        You can disconnect at any time.
      </p>
    </GlassCard>
  );
}
