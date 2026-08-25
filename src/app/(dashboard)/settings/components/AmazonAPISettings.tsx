"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Link2Off,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { useToastStore } from "@/hooks/use-toast-store";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

type Provider = "amazon_sp_api" | "amazon_ads";

interface CredentialSummary {
  provider: Provider;
  credential_kind: string;
  fingerprint: string | null;
  updated_at: string;
}

interface AmazonAccount {
  id: string;
  region: string;
  marketplace_id: string;
  seller_account_id: string;
  display_name: string;
  status: string;
  capabilities: string[];
  connection_metadata: { adsProfileId?: string };
  last_healthy_at: string | null;
  last_error_code: string | null;
  credentials: CredentialSummary[];
}

interface ProviderSecrets {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  applicationId: string;
  adsProfileId: string;
}

const emptySecrets: ProviderSecrets = {
  clientId: "",
  clientSecret: "",
  refreshToken: "",
  applicationId: "",
  adsProfileId: "",
};

const providerDetails: Record<Provider, {
  title: string;
  description: string;
  capability: string;
  accent: string;
}> = {
  amazon_sp_api: {
    title: "Amazon Selling Partner API",
    description: "Orders, catalog, listings, inventory, finances, reports, and account health.",
    capability: "selling_partner",
    accent: "text-orange-400",
  },
  amazon_ads: {
    title: "Amazon Ads API",
    description: "Sponsored Products reporting and policy-controlled campaign operations.",
    capability: "advertising",
    accent: "text-amber-400",
  },
};

export function AmazonAPISettings() {
  const workspaceId = useAuth((state) => state.user?.workspaceId);
  const [accounts, setAccounts] = useState<AmazonAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [sellerAccountId, setSellerAccountId] = useState("");
  const [displayName, setDisplayName] = useState("Amazon India");
  const [marketplaceId, setMarketplaceId] = useState("A21TJRUUN4KGV");
  const [region, setRegion] = useState("India");
  const [secrets, setSecrets] = useState<Record<Provider, ProviderSecrets>>({
    amazon_sp_api: { ...emptySecrets },
    amazon_ads: { ...emptySecrets },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Provider | null>(null);
  const [syncing, setSyncing] = useState<"listings" | "orders" | "ads" | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const response = await sellerplusApiFetch("/api/settings/amazon-integrations");
    const payload = await response.json();
    if (!response.ok) {
      useToastStore.getState().error("Amazon settings unavailable", payload.error ?? "Unable to load integrations.");
      setLoading(false);
      return;
    }
    const nextAccounts = (payload.data ?? []) as AmazonAccount[];
    setAccounts(nextAccounts);
    const current = nextAccounts.find((account) => account.id === selectedAccountId) ?? nextAccounts[0];
    if (current) {
      setSelectedAccountId(current.id);
      setSellerAccountId(current.seller_account_id);
      setDisplayName(current.display_name);
      setMarketplaceId(current.marketplace_id);
      setRegion(current.region);
      setSecrets((value) => ({
        ...value,
        amazon_ads: {
          ...value.amazon_ads,
          adsProfileId: current.connection_metadata?.adsProfileId ?? "",
        },
      }));
    }
    setLoading(false);
  }, [selectedAccountId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateSecret = (provider: Provider, field: keyof ProviderSecrets, value: string) => {
    setSecrets((current) => ({
      ...current,
      [provider]: { ...current[provider], [field]: value },
    }));
  };

  const saveProvider = async (provider: Provider) => {
    if (!sellerAccountId.trim()) {
      useToastStore.getState().warning("Seller ID required", "Enter the Amazon seller or merchant identifier for this account.");
      return;
    }
    const values = secrets[provider];
    if (!values.clientId && !values.clientSecret && !values.refreshToken && !selectedAccount) {
      useToastStore.getState().warning("Credentials required", "Provide application credentials or configure platform credentials on the server.");
      return;
    }

    setSaving(provider);
    const response = await sellerplusApiFetch("/api/settings/amazon-integrations", {
      method: "PUT",
      body: JSON.stringify({
        provider,
        ...(selectedAccount ? { accountId: selectedAccount.id } : {}),
        marketplaceId,
        sellerAccountId,
        region,
        displayName,
        ...(values.clientId ? { clientId: values.clientId } : {}),
        ...(values.clientSecret ? { clientSecret: values.clientSecret } : {}),
        ...(values.refreshToken ? { refreshToken: values.refreshToken } : {}),
        ...(provider === "amazon_sp_api" && values.applicationId ? { applicationId: values.applicationId } : {}),
        ...(provider === "amazon_ads" && values.adsProfileId ? { adsProfileId: values.adsProfileId } : {}),
      }),
    });
    const payload = await response.json();
    setSaving(null);
    if (!response.ok) {
      useToastStore.getState().error("Amazon configuration failed", payload.error ?? "The credentials were not saved.");
      return;
    }
    setSecrets((current) => ({ ...current, [provider]: { ...emptySecrets } }));
    useToastStore.getState().success("Credentials secured", "Amazon credentials were encrypted and saved server-side.");
    await load();
  };

  const disconnect = async (provider: Provider) => {
    if (!selectedAccount || !window.confirm(`Disconnect ${providerDetails[provider].title}? Imported history will be retained.`)) return;
    const response = await sellerplusApiFetch("/api/settings/amazon-integrations", {
      method: "DELETE",
      body: JSON.stringify({ provider, accountId: selectedAccount.id }),
    });
    const payload = await response.json();
    if (!response.ok) {
      useToastStore.getState().error("Disconnect failed", payload.error ?? "The connection was not changed.");
      return;
    }
    useToastStore.getState().success("Disconnected", "Credentials were revoked from SellerPlus; imported history was retained.");
    await load();
  };

  const runSync = async (kind: "listings" | "orders" | "ads") => {
    setSyncing(kind);
    const endpoint = kind === "ads" ? "/api/amazon/sync-ads" : `/api/amazon/sync-${kind}`;
    const response = await sellerplusApiFetch(endpoint, {
      method: "POST",
      body: kind === "ads" && selectedAccount ? JSON.stringify({ marketplaceAccountId: selectedAccount.id }) : "{}",
    });
    const payload = await response.json();
    setSyncing(null);
    if (!response.ok) {
      useToastStore.getState().error("Sync could not start", payload.error ?? "Check the Amazon authorization and try again.");
      return;
    }
    useToastStore.getState().success(
      kind === "ads" ? "Ads sync queued" : "Sync request accepted",
      kind === "ads" ? "SellerPlus will process the Amazon report in the background." : "Amazon data synchronization has started.",
    );
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center" role="status"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-2.5"><ShieldCheck className="h-5 w-5 text-indigo-400" /></div>
          <div>
            <h2 className="text-lg font-bold text-white">Amazon connection</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">
              Credentials are encrypted at rest and never returned to the browser. For private Amazon applications, paste the self-authorization refresh token. Public applications can add OAuth after their Amazon redirect URI and application approval are configured.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <label className="text-xs font-semibold text-zinc-400">Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white" />
          </label>
          <label className="text-xs font-semibold text-zinc-400">Seller / merchant ID
            <input value={sellerAccountId} onChange={(event) => setSellerAccountId(event.target.value)} placeholder="A1B2C3D4E5F6G7" className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white" />
          </label>
          <label className="text-xs font-semibold text-zinc-400">Marketplace ID
            <input value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-sm text-white" />
          </label>
          <label className="text-xs font-semibold text-zinc-400">API region
            <select value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white">
              <option>India</option><option>North America</option><option>Europe</option><option>Far East</option>
            </select>
          </label>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {(Object.keys(providerDetails) as Provider[]).map((provider) => {
          const details = providerDetails[provider];
          const values = secrets[provider];
          const connected = Boolean(
            selectedAccount?.capabilities.includes(details.capability) &&
            selectedAccount.credentials.some((credential) => credential.provider === provider && credential.credential_kind === "refresh_token"),
          );
          const Icon = provider === "amazon_sp_api" ? ShoppingCart : TrendingUp;
          const fingerprint = selectedAccount?.credentials.find(
            (credential) => credential.provider === provider && credential.credential_kind === "refresh_token",
          )?.fingerprint;
          return (
            <GlassCard key={provider} className="p-6">
              <div className="mb-5 flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 ${details.accent}`} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-white">{details.title}</h3>
                  <p className="mt-1 text-xs text-zinc-500">{details.description}</p>
                </div>
                <span className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${connected ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-white/10 text-zinc-500"}`}>
                  {connected ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {connected ? "Connected" : "Setup required"}
                </span>
              </div>

              {connected && fingerprint && <p className="mb-4 rounded-lg bg-white/[0.03] px-3 py-2 font-mono text-[10px] text-zinc-500">Stored token fingerprint: {fingerprint}</p>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-zinc-400">LWA client ID
                  <input value={values.clientId} onChange={(event) => updateSecret(provider, "clientId", event.target.value)} autoComplete="off" placeholder={connected ? "Leave blank to keep current" : "amzn1.application-oa2-client…"} className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white" />
                </label>
                <label className="text-xs text-zinc-400">LWA client secret
                  <input type="password" value={values.clientSecret} onChange={(event) => updateSecret(provider, "clientSecret", event.target.value)} autoComplete="new-password" placeholder={connected ? "Leave blank to keep current" : "Required for BYOK"} className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white" />
                </label>
                <label className="text-xs text-zinc-400">Refresh token
                  <input type="password" value={values.refreshToken} onChange={(event) => updateSecret(provider, "refreshToken", event.target.value)} autoComplete="new-password" placeholder={connected ? "Leave blank to keep current" : "Self-authorization token"} className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white" />
                </label>
                {provider === "amazon_sp_api" ? (
                  <label className="text-xs text-zinc-400">Application ID
                    <input value={values.applicationId} onChange={(event) => updateSecret(provider, "applicationId", event.target.value)} placeholder="Optional for OAuth" className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white" />
                  </label>
                ) : (
                  <label className="text-xs text-zinc-400">Ads profile ID
                    <input value={values.adsProfileId} onChange={(event) => updateSecret(provider, "adsProfileId", event.target.value)} placeholder="Optional; auto-discovered" className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white" />
                  </label>
                )}
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {connected && <button type="button" onClick={() => disconnect(provider)} className="flex h-9 items-center gap-1.5 rounded-lg border border-red-500/20 px-3 text-xs font-bold text-red-400 hover:bg-red-500/10"><Link2Off className="h-3.5 w-3.5" /> Disconnect</button>}
                <button type="button" onClick={() => saveProvider(provider)} disabled={saving === provider} className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-500 px-4 text-xs font-bold text-white hover:bg-indigo-600 disabled:opacity-50">
                  {saving === provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Encrypt & save
                </button>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="p-6">
        <div className="mb-4 flex items-center gap-2"><KeyRound className="h-5 w-5 text-indigo-400" /><h3 className="font-bold text-white">Connection diagnostics</h3></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => runSync("listings")} disabled={Boolean(syncing)} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-bold text-zinc-300 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${syncing === "listings" ? "animate-spin" : ""}`} /> Sync listings</button>
          <button type="button" onClick={() => runSync("orders")} disabled={Boolean(syncing)} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-bold text-zinc-300 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${syncing === "orders" ? "animate-spin" : ""}`} /> Sync orders</button>
          <button type="button" onClick={() => runSync("ads")} disabled={Boolean(syncing)} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-bold text-zinc-300 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${syncing === "ads" ? "animate-spin" : ""}`} /> Queue Ads report</button>
        </div>
        {selectedAccount?.last_error_code && <p className="mt-4 text-xs text-red-400">Latest Amazon health error: {selectedAccount.last_error_code}</p>}
      </GlassCard>
    </div>
  );
}
