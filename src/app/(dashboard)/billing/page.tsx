"use client";

import { useEffect, useState } from "react";
import { Activity, Bot, Database, Loader2, Receipt, Server, ShoppingBag, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PageHeader } from "@/components/page-header";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

interface UsageSummary {
  periodStart: string;
  aiRequests: number | string;
  inputTokens: number | string;
  outputTokens: number | string;
  aiCostMicros: number | string;
  jobs: number | string;
  generatedAssets: number | string;
  storageBytes: number | string;
  marketplaceAccounts: number | string;
  users: number | string;
}

interface BillingResponse {
  billingConfigured: boolean;
  subscription: null | {
    plan_type: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  };
  usage: UsageSummary;
  payments: Array<{
    id: string;
    order_id: string;
    amount: number | string;
    currency: string;
    status: string;
    created_at: string;
  }>;
}

function numeric(value: number | string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBytes(value: number | string) {
  const bytes = numeric(value);
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2 text-zinc-500">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

export default function BillingPage() {
  const workspaceId = useAuth((state) => state.user?.workspaceId);
  const [data, setData] = useState<BillingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void sellerplusApiFetch("/api/billing/usage").then(async (response) => {
      const payload = await response.json();
      if (!active) return;
      if (!response.ok) {
        setError(payload.error ?? "Billing usage could not be loaded.");
        return;
      }
      setData(payload.data);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Billing usage could not be loaded.");
    });
    return () => { active = false; };
  }, [workspaceId]);

  return (
    <div className="flex flex-col gap-6 pb-12">
      <PageHeader
        title="Usage & billing"
        description="Measured SellerPlus workspace usage and recorded payment history."
      />

      {error ? (
        <GlassCard className="border-rose-500/20 text-sm text-rose-300">{error}</GlassCard>
      ) : !data ? (
        <GlassCard className="flex min-h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Loading usage" />
        </GlassCard>
      ) : (
        <>
          <GlassCard>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Subscription record</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {data.subscription ? data.subscription.plan_type : "No paid subscription"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {data.subscription
                    ? `Status: ${data.subscription.status}`
                    : "SellerPlus has not recorded an active paid plan for this workspace."}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs ${data.billingConfigured ? "border-emerald-500/20 text-emerald-400" : "border-amber-500/20 text-amber-400"}`}>
                {data.billingConfigured ? "Gateway configured" : "Checkout unavailable"}
              </span>
            </div>
            {!data.billingConfigured && (
              <p className="mt-5 border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-zinc-500">
                No checkout is exposed. A production price catalog, signed payment webhooks, tax handling, and entitlement reconciliation must be configured before payments can be accepted.
              </p>
            )}
          </GlassCard>

          <GlassCard>
            <div className="mb-5 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h2 className="font-semibold text-white">Usage since {new Date(data.usage.periodStart).toLocaleDateString()}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="AI requests" value={numeric(data.usage.aiRequests).toLocaleString()} icon={<Bot className="h-4 w-4" />} />
              <Metric label="AI tokens" value={(numeric(data.usage.inputTokens) + numeric(data.usage.outputTokens)).toLocaleString()} icon={<Activity className="h-4 w-4" />} />
              <Metric label="Recorded AI cost" value={`$${(numeric(data.usage.aiCostMicros) / 1_000_000).toFixed(4)}`} icon={<Receipt className="h-4 w-4" />} />
              <Metric label="Background jobs" value={numeric(data.usage.jobs).toLocaleString()} icon={<Server className="h-4 w-4" />} />
              <Metric label="Generated assets" value={numeric(data.usage.generatedAssets).toLocaleString()} icon={<Database className="h-4 w-4" />} />
              <Metric label="Managed storage" value={formatBytes(data.usage.storageBytes)} icon={<Database className="h-4 w-4" />} />
              <Metric label="Marketplace accounts" value={numeric(data.usage.marketplaceAccounts).toLocaleString()} icon={<ShoppingBag className="h-4 w-4" />} />
              <Metric label="Workspace users" value={numeric(data.usage.users).toLocaleString()} icon={<Users className="h-4 w-4" />} />
            </div>
          </GlassCard>

          <GlassCard>
            <div className="mb-5 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-indigo-400" />
              <h2 className="font-semibold text-white">Recorded payments</h2>
            </div>
            {data.payments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/[0.08] px-5 py-10 text-center text-sm text-zinc-500">
                No payments have been recorded for this workspace.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="border-b border-white/[0.06] text-zinc-500">
                    <tr><th className="pb-3">Reference</th><th className="pb-3">Date</th><th className="pb-3">Amount</th><th className="pb-3">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {data.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="py-3 font-mono text-zinc-300">{payment.order_id}</td>
                        <td className="py-3 text-zinc-400">{new Date(payment.created_at).toLocaleString()}</td>
                        <td className="py-3 text-zinc-300">{payment.currency} {numeric(payment.amount).toLocaleString()}</td>
                        <td className="py-3 capitalize text-zinc-400">{payment.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
