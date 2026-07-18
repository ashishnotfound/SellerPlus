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
  Save,
  Key
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = "sp" | "ads";

interface TokenRow {
  id: string;
  provider: Provider;
  expires_at: string;
  scope: string | null;
}

interface DevCredentials {
  sp_client_id: string;
  sp_client_secret: string;
  ads_client_id: string;
  ads_client_secret: string;
  sp_refresh_token?: string;
  ads_refresh_token?: string;
  merchant_token?: string;
}

// ─── Amazon OAuth helpers ──────────────────────────────────────────────────────

const AMAZON_AUTH_BASE = "https://sellercentral.amazon.com/apps/authorize/consent";
const AMAZON_ADS_AUTH_BASE = "https://www.amazon.com/ap/oa";

const SP_SCOPE = "sellingpartnerapi::notifications sellingpartnerapi::migration";
const ADS_SCOPE = "advertising::campaign_management";

function buildOAuthUrl(provider: Provider, customClientId?: string): string {
  const defaultId = provider === "sp" 
    ? process.env.NEXT_PUBLIC_AMAZON_SP_CLIENT_ID 
    : process.env.NEXT_PUBLIC_AMAZON_ADS_CLIENT_ID;
    
  const clientId = customClientId || defaultId || "";
  const redirectUri = process.env.NEXT_PUBLIC_AMAZON_OAUTH_REDIRECT_URI || `${window.location.origin}/api/amazon/callback`;
  
  console.log(`[AmazonOAuth] provider: ${provider}, customClientId: ${customClientId}, defaultId: ${defaultId}, resolved clientId: ${clientId}`);

  // Safe UUID generation that doesn't crash in insecure contexts
  let uuid = "";
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    uuid = window.crypto.randomUUID();
  } else {
    uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  const params = new URLSearchParams({
    application_id: clientId,
    redirect_uri: redirectUri,
    state: `${provider}:${uuid}`,
    ...(provider === "sp" && {
      version: "beta",
    }),
    ...(provider === "ads" && {
      client_id: clientId,
      scope: ADS_SCOPE,
      response_type: "code",
    }),
  });

  const base = provider === "sp" ? AMAZON_AUTH_BASE : AMAZON_ADS_AUTH_BASE;
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

function ApiCard({ provider, token, loading, onConnect, onDisconnect }: ApiCardProps) {
  const isConnected = !!token;
  const expiresAt = token ? new Date(token.expires_at) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;
  const label = provider === "sp" ? "Amazon SP API" : "Amazon Ads API";
  const Icon = provider === "sp" ? ShoppingCart : TrendingUp;
  const accentColor = provider === "sp"
    ? "from-orange-500/20 to-orange-600/10 border-orange-500/30"
    : "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30";
  const btnColor = provider === "sp"
    ? "bg-orange-500 hover:bg-orange-600"
    : "bg-yellow-500 hover:bg-yellow-600";
  const iconColor = provider === "sp" ? "text-orange-400" : "text-yellow-400";

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 transition-all ${accentColor}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10`}>
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

      {isConnected && (
        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white/[0.04] rounded-xl px-3 py-2">
            <p className="text-zinc-500 mb-0.5">Expires</p>
            <p className="text-zinc-200 font-medium truncate">
              {expiresAt?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
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

      <div className="flex items-center gap-2">
        {!isConnected ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => onConnect(provider)}
            className={`flex-1 h-10 rounded-xl ${btnColor} text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50`}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Link2 className="w-4 h-4" />Connect {provider === "sp" ? "SP API" : "Ads API"}</>}
          </button>
        ) : (
          <>
            {isExpired && (
              <button
                type="button"
                onClick={() => onConnect(provider)}
                className={`flex-1 h-10 rounded-xl ${btnColor} text-white font-bold text-xs flex items-center justify-center gap-2 transition-all`}
              >
                <RefreshCw className="w-4 h-4" /> Reconnect
              </button>
            )}
            <button
              type="button"
              onClick={() => onDisconnect(token!.id)}
              className="h-10 px-4 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs flex items-center gap-1.5 transition-all"
            >
              <Link2Off className="w-4 h-4" /> Disconnect
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
  const [creds, setCreds] = useState<DevCredentials>({
    sp_client_id: "", sp_client_secret: "", ads_client_id: "", ads_client_secret: "", sp_refresh_token: "", ads_refresh_token: "", merchant_token: ""
  });
  const [loading, setLoading] = useState(true);
  const [savingCreds, setSavingCreds] = useState(false);
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [syncingListings, setSyncingListings] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    
    // Fetch tokens
    const { data: tokenData } = await supabase
      .from("amazon_user_tokens")
      .select("id, provider, expires_at, scope, refresh_token")
      .eq("supabase_user_id", user.id);
    if (tokenData) setTokens(tokenData as TokenRow[]);

    // Fetch custom developer credentials
    const { data: credData } = await supabase
      .from("amazon_developer_credentials")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
      
    if (credData) {
      setCreds({
        sp_client_id: credData.sp_client_id || "",
        sp_client_secret: credData.sp_client_secret || "",
        ads_client_id: credData.ads_client_id || "",
        ads_client_secret: credData.ads_client_secret || "",
        sp_refresh_token: tokenData?.find((t: any) => t.provider === "sp")?.refresh_token || "",
        ads_refresh_token: tokenData?.find((t: any) => t.provider === "ads")?.refresh_token || "",
        merchant_token: credData.merchant_token || ""
      });
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Listen for callback success or failure via URL params
  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("amazon_connected");
    const errorParam = url.searchParams.get("amazon_error");

    if (connected) {
      useToastStore.getState().success("Amazon Connected", "Your Amazon account has been linked successfully.");
      url.searchParams.delete("amazon_connected");
      window.history.replaceState({}, "", url.toString());
      fetchData();
    } else if (errorParam) {
      const readableError = decodeURIComponent(errorParam).replace(/_/g, " ");
      useToastStore.getState().error("Amazon Connection Failed", readableError);
      url.searchParams.delete("amazon_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [fetchData]);

  const handleSaveCreds = async () => {
    if (!user?.id) return;
    setSavingCreds(true);
    try {
      const { error } = await supabase
        .from("amazon_developer_credentials")
        .upsert({ 
          user_id: user.id, 
          sp_client_id: creds.sp_client_id, 
          sp_client_secret: creds.sp_client_secret, 
          ads_client_id: creds.ads_client_id, 
          ads_client_secret: creds.ads_client_secret,
          merchant_token: creds.merchant_token
        }, { onConflict: "user_id" });
        
      if (error) throw error;
      
      if (creds.sp_refresh_token) {
        await supabase.from("amazon_user_tokens").delete().eq("supabase_user_id", user.id).eq("provider", "sp");
        await supabase.from("amazon_user_tokens").insert({
          supabase_user_id: user.id,
          provider: "sp",
          refresh_token: creds.sp_refresh_token,
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        });
      }
      
      if (creds.ads_refresh_token) {
        await supabase.from("amazon_user_tokens").delete().eq("supabase_user_id", user.id).eq("provider", "ads");
        await supabase.from("amazon_user_tokens").insert({
          supabase_user_id: user.id,
          provider: "ads",
          refresh_token: creds.ads_refresh_token,
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        });
      }

      useToastStore.getState().success("Saved", "Amazon Developer credentials & tokens saved.");
      fetchData();
    } catch (err: any) {
      useToastStore.getState().error("Error", "Failed to save credentials: " + err.message);
    }
    setSavingCreds(false);
  };

  const handleConnect = (provider: Provider) => {
    const customId = provider === "sp" ? creds.sp_client_id : creds.ads_client_id;
    const envId = provider === "sp" ? process.env.NEXT_PUBLIC_AMAZON_SP_CLIENT_ID : process.env.NEXT_PUBLIC_AMAZON_ADS_CLIENT_ID;
    
    if (!customId && !envId) {
      useToastStore.getState().error(
        "Not Configured",
        `Amazon ${provider === "sp" ? "SP" : "Ads"} API Client ID is missing. Please save it in your Developer Credentials first.`
      );
      return;
    }
    
    setConnecting(provider);
    const url = buildOAuthUrl(provider, customId);
    
    console.log(`[AmazonOAuth] Final Redirect URL: \n${url}`);
    
    window.location.href = url;
  };

  const handleDisconnect = async (id: string) => {
    const { error } = await supabase.from("amazon_user_tokens").delete().eq("id", id);
    if (error) {
      useToastStore.getState().error("Error", "Failed to disconnect. " + error.message);
    } else {
      useToastStore.getState().success("Disconnected", "Amazon account unlinked.");
      fetchData();
    }
  };

  const handleSyncListings = async () => {
    setSyncingListings(true);
    try {
      useToastStore.getState().success("Syncing", "Requesting Listings Report from Amazon... This may take a few minutes.");
      
      const res = await fetch("/api/amazon/sync-listings", {
        method: "POST",
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to sync listings");
      }
      
      useToastStore.getState().success(
        "Sync Complete", 
        `Successfully imported/updated ${data.synced || data.added || 0} listings from Amazon.`
      );
    } catch (err: any) {
      useToastStore.getState().error("Sync Failed", err.message);
    }
    setSyncingListings(false);
  };

  const spToken = tokens.find((t) => t.provider === "sp") ?? null;
  const adsToken = tokens.find((t) => t.provider === "ads") ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Dev Credentials Form */}
      <GlassCard>
        <div className="flex items-center gap-2.5 mb-6">
          <Key className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-bold text-white">Amazon Developer Credentials</h3>
        </div>
        <p className="text-xs text-zinc-400 mb-6">
          Bring your own Amazon App credentials (BYOK). Enter your Client ID and Secret to authenticate using your own developer account.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-orange-400">Selling Partner API (SP-API)</h4>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1.5 block">Client ID</label>
              <input
                type="text"
                value={creds.sp_client_id}
                onChange={(e) => setCreds({ ...creds, sp_client_id: e.target.value })}
                placeholder="amzn1.application-oa2-client..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1.5 block">Client Secret</label>
              <input
                type="password"
                value={creds.sp_client_secret}
                onChange={(e) => setCreds({ ...creds, sp_client_secret: e.target.value })}
                placeholder="••••••••••••••••••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1.5 block">Refresh Token (Optional)</label>
              <input
                type="password"
                value={creds.sp_refresh_token}
                onChange={(e) => setCreds({ ...creds, sp_refresh_token: e.target.value })}
                placeholder="Atzr|..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1.5 block">Merchant Token (Seller ID)</label>
              <input
                type="text"
                value={creds.merchant_token}
                onChange={(e) => setCreds({ ...creds, merchant_token: e.target.value })}
                placeholder="A1B2C3D4E5F6G7"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
              />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-yellow-400">Advertising API</h4>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1.5 block">Client ID</label>
              <input
                type="text"
                value={creds.ads_client_id}
                onChange={(e) => setCreds({ ...creds, ads_client_id: e.target.value })}
                placeholder="amzn1.application-oa2-client..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-500/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1.5 block">Client Secret</label>
              <input
                type="password"
                value={creds.ads_client_secret}
                onChange={(e) => setCreds({ ...creds, ads_client_secret: e.target.value })}
                placeholder="••••••••••••••••••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-500/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1.5 block">Refresh Token (Optional)</label>
              <input
                type="password"
                value={creds.ads_refresh_token}
                onChange={(e) => setCreds({ ...creds, ads_refresh_token: e.target.value })}
                placeholder="Atzr|..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-500/50"
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={handleSaveCreds}
            disabled={savingCreds}
            className="h-10 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {savingCreds ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Credentials
          </button>
        </div>
      </GlassCard>

      <GlassCard>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
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
          
          <div className="flex items-center gap-3">
            {spToken && !loading && (
              <button
                onClick={handleSyncListings}
                disabled={syncingListings}
                className="h-9 px-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {syncingListings ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {syncingListings ? "Syncing..." : "Sync Listings"}
              </button>
            )}

            {(spToken || adsToken) && (
              <button
                type="button"
                onClick={fetchData}
                className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                title="Refresh status"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* API Cards */}
        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="flex justify-center items-center h-24">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          ) : (
            <>
              <ApiCard provider="sp" token={spToken} loading={connecting === "sp"} onConnect={handleConnect} onDisconnect={handleDisconnect} />
              <ApiCard provider="ads" token={adsToken} loading={connecting === "ads"} onConnect={handleConnect} onDisconnect={handleDisconnect} />
            </>
          )}
        </div>

        {/* Info footer */}
        <p className="mt-5 text-xs text-zinc-600 text-center">
          Tokens are securely stored in Supabase. You can disconnect at any time.
        </p>
      </GlassCard>
    </div>
  );
}
