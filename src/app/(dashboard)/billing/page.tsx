"use client";

import React, { useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { UsageMeter } from "@/components/usage-meter";
import { EmptyState } from "@/components/empty-state";
import {
  Check,
  CreditCard,
  Receipt,
  HelpCircle,
  Download,
  Zap,
  Shield,
  Sparkles,
  Building2,
  Star,
  ArrowRight,
  AlertCircle,
  Clock,
  Lock,
} from "lucide-react";

// ─── Plan Definitions ─────────────────────────────────────────────────

interface Plan {
  id: "free" | "starter" | "pro" | "business";
  name: string;
  price: number;
  period: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  highlight?: boolean;
  comingSoon?: boolean;
  color: {
    text: string;
    bg: string;
    border: string;
    gradient: string;
    badge: string;
  };
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "forever",
    description: "Get started with core analytics.",
    icon: <Zap className="w-5 h-5" />,
    features: [
      "10 AI Generations total",
      "3 AI Listing Audits",
      "Basic dashboard",
      "Email support",
    ],
    color: {
      text: "text-zinc-300",
      bg: "bg-zinc-500/5",
      border: "border-zinc-700/50",
      gradient: "",
      badge: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    },
  },
  {
    id: "starter",
    name: "Starter",
    price: 599,
    period: "month",
    description: "Perfect for sellers just getting started.",
    icon: <Star className="w-5 h-5" />,
    comingSoon: true,
    features: [
      "100 AI Generations/month",
      "25 AI Listing Audits/month",
      "Gemini Keyword Engine™",
      "BI Analytics Dashboard",
      "Automation Engine",
      "Priority email support",
    ],
    color: {
      text: "text-indigo-300",
      bg: "bg-indigo-500/5",
      border: "border-indigo-500/20",
      gradient: "from-indigo-400 to-sky-400",
      badge: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    },
  },
  {
    id: "pro",
    name: "Pro",
    price: 1499,
    period: "month",
    description: "For serious sellers scaling their business.",
    icon: <Sparkles className="w-5 h-5" />,
    highlight: true,
    comingSoon: true,
    features: [
      "500 AI Generations/month",
      "Unlimited Listing Audits",
      "Full AI Business Consultant",
      "Executive Dashboard",
      "A+ Content & Brand Story",
      "Amazon SP-API integration",
      "Dedicated Slack support",
    ],
    color: {
      text: "text-emerald-300",
      bg: "bg-emerald-500/5",
      border: "border-emerald-500/30",
      gradient: "from-emerald-400 to-teal-400",
      badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
  },
  {
    id: "business",
    name: "Business",
    price: 4999,
    period: "month",
    description: "For agencies managing multiple seller accounts.",
    icon: <Building2 className="w-5 h-5" />,
    comingSoon: true,
    features: [
      "Unlimited AI Generations",
      "Multi-account management",
      "White-label reports",
      "Custom automation rules",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    color: {
      text: "text-amber-300",
      bg: "bg-amber-500/5",
      border: "border-amber-500/20",
      gradient: "from-amber-400 to-orange-400",
      badge: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
  },
];

// ─── Mock Usage Data ───────────────────────────────────────────────────

const MOCK_USAGE = {
  aiGenerations: { used: 7, total: 10 },
  listingAudits: { used: 2, total: 3 },
  apiCalls: { used: 142, total: 1000 },
  storage: { used: 0.3, total: 1 },
  automationRuns: { used: 0, total: 50 },
};

// ─── Mock Invoice History ──────────────────────────────────────────────

const MOCK_INVOICES = [
  { id: "INV-2026-001", date: "July 1, 2026", amount: 0, plan: "Free", status: "paid" as const },
];

// ─── Current Plan Card ─────────────────────────────────────────────────

function CurrentPlanCard() {
  const currentPlan = PLANS[0]; // Free plan

  return (
    <GlassCard className="relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(0,196,140,0.4), transparent 60%)" }}
      />

      <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-600">Current Plan</p>
            <StatusBadge variant="active" label="Active" dot />
          </div>
          <div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Free Plan</h2>
            <p className="text-sm text-zinc-500 mt-1">You're on the free tier. Upgrade to unlock the full power of SellerPlus.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Clock className="w-3.5 h-3.5 text-zinc-600" />
              No expiry — Free forever
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 shrink-0 min-w-[160px]">
          <div className="text-right mb-1">
            <span className="text-3xl font-extrabold text-white">₹0</span>
            <span className="text-xs text-zinc-600 ml-1">/ forever</span>
          </div>
          <button
            className="w-full h-10 rounded-xl bg-gradient-to-r from-indigo-400 to-emerald-400 text-black font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
          >
            Upgrade Plan
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <p className="text-[10px] text-zinc-600 text-center">Payment setup coming soon</p>
        </div>
      </div>

      {/* Renewal note */}
      <div className="mt-5 pt-4 border-t border-white/[0.05] flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-xs text-zinc-500 leading-relaxed">
          <strong className="text-zinc-300">Beta Note:</strong> SellerPlus is currently in private beta. Paid plans will become available after public launch. All beta users will receive a special early-adopter discount.
        </p>
      </div>
    </GlassCard>
  );
}

// ─── Usage Overview Card ───────────────────────────────────────────────

function UsageOverviewCard() {
  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-6">
        <Zap className="w-4 h-4 text-indigo-400" />
        <h3 className="text-base font-bold text-white">Usage This Month</h3>
        <StatusBadge variant="beta" label="Free Tier" className="ml-auto" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <UsageMeter
          label="AI Generations"
          used={MOCK_USAGE.aiGenerations.used}
          total={MOCK_USAGE.aiGenerations.total}
          color="indigo"
        />
        <UsageMeter
          label="Listing Audits"
          used={MOCK_USAGE.listingAudits.used}
          total={MOCK_USAGE.listingAudits.total}
          color="emerald"
        />
        <UsageMeter
          label="API Calls"
          used={MOCK_USAGE.apiCalls.used}
          total={MOCK_USAGE.apiCalls.total}
          color="sky"
        />
        <UsageMeter
          label="Storage"
          used={MOCK_USAGE.storage.used}
          total={MOCK_USAGE.storage.total}
          unit="GB"
          color="amber"
        />
        <UsageMeter
          label="Automation Runs"
          used={MOCK_USAGE.automationRuns.used}
          total={MOCK_USAGE.automationRuns.total}
          color="rose"
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">SP-API Connections</span>
            <span className="text-xs font-bold text-zinc-300">0 / 1</span>
          </div>
          <div className="h-1.5 bg-white/[0.05] rounded-full" />
          <span className="text-[10px] text-zinc-700">No account connected yet</span>
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Plan Cards ────────────────────────────────────────────────────────

function PlanCard({ plan, isCurrent }: { plan: Plan; isCurrent: boolean }) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-300 ${
        plan.highlight
          ? `${plan.color.border} ${plan.color.bg} shadow-[0_0_40px_rgba(0,196,140,0.06)]`
          : `border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.03]`
      }`}
    >
      {/* Most Popular badge */}
      {plan.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-emerald-400 to-teal-400 text-black shadow-lg">
            Most Popular
          </span>
        </div>
      )}

      {/* Coming Soon badge */}
      {plan.comingSoon && (
        <div className="absolute top-3 right-3">
          <StatusBadge variant="coming-soon" label="Coming Soon" />
        </div>
      )}

      {/* Icon + Name */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`w-9 h-9 rounded-xl ${plan.color.bg} border ${plan.color.border} flex items-center justify-center ${plan.color.text}`}>
          {plan.icon}
        </div>
        <div>
          <h3 className="text-base font-bold text-white">{plan.name}</h3>
          <p className="text-[11px] text-zinc-500">{plan.description}</p>
        </div>
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-1 mb-5">
        <span className="text-3xl font-extrabold text-white">
          {plan.price === 0 ? "₹0" : `₹${plan.price.toLocaleString()}`}
        </span>
        <span className="text-xs text-zinc-600">/{plan.period}</span>
      </div>

      {/* Features */}
      <ul className="flex flex-col gap-2.5 mb-6 flex-1">
        {plan.features.map((feat, idx) => (
          <li key={idx} className="flex items-start gap-2 text-xs text-zinc-400">
            <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${plan.color.text}`} />
            {feat}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <button
          disabled
          className="w-full h-10 rounded-xl text-xs font-bold text-zinc-500 bg-white/[0.03] border border-white/[0.06] cursor-default"
        >
          Current Plan
        </button>
      ) : plan.comingSoon ? (
        <button
          disabled
          className={`w-full h-10 rounded-xl text-xs font-bold border cursor-not-allowed opacity-60 flex items-center justify-center gap-1.5 ${plan.color.border} ${plan.color.text} ${plan.color.bg}`}
        >
          <Lock className="w-3 h-3" />
          Coming Soon
        </button>
      ) : (
        <button
          className={`w-full h-10 rounded-xl text-xs font-bold bg-gradient-to-r ${plan.color.gradient} text-black hover:opacity-90 transition-all hover:shadow-lg`}
        >
          Select {plan.name}
        </button>
      )}
    </div>
  );
}

// ─── Invoice History ───────────────────────────────────────────────────

function InvoiceHistory() {
  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-indigo-400" />
          <h3 className="text-base font-bold text-white">Billing History</h3>
        </div>
        <StatusBadge variant="beta" label="Beta" />
      </div>

      {MOCK_INVOICES.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Receipt className="w-8 h-8" />}
          title="No Invoices Yet"
          description="Your billing history will appear here after your first subscription payment."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.05] text-zinc-600 font-semibold">
                <th className="pb-3 pr-4">Invoice</th>
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3 pr-4">Plan</th>
                <th className="pb-3 pr-4">Amount</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {MOCK_INVOICES.map((inv) => (
                <tr key={inv.id} className="h-12 hover:bg-white/[0.02] transition-colors">
                  <td className="pr-4 font-mono text-zinc-300 text-[11px]">{inv.id}</td>
                  <td className="pr-4 text-zinc-400">{inv.date}</td>
                  <td className="pr-4">
                    <span className="text-zinc-300 font-medium">{inv.plan}</span>
                  </td>
                  <td className="pr-4 font-bold text-zinc-200">
                    {inv.amount === 0 ? "₹0.00" : `₹${inv.amount.toLocaleString()}`}
                  </td>
                  <td className="pr-4">
                    <StatusBadge variant={inv.status === "paid" ? "success" : "pending"} label={inv.status} />
                  </td>
                  <td className="text-right">
                    <button className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-300 transition-colors">
                      <Download className="w-3 h-3" />
                      <span className="text-[10px]">PDF</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Payment Method Placeholder ────────────────────────────────────────

function PaymentMethodCard() {
  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-5">
        <CreditCard className="w-4 h-4 text-indigo-400" />
        <h3 className="text-base font-bold text-white">Payment Method</h3>
      </div>

      <div className="border border-dashed border-white/[0.08] rounded-xl p-5 flex flex-col items-center gap-3 bg-white/[0.01]">
        <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <Lock className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-white mb-1">Payment Setup Coming Soon</p>
          <p className="text-xs text-zinc-500 max-w-[220px] leading-relaxed">
            UPI, Cards, Net Banking, and Wallets will be available when paid plans launch.
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Shield className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] text-zinc-600">256-bit SSL encryption · PCI-DSS compliant</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 opacity-30">
        {["UPI", "VISA", "MC", "RuPay"].map((method) => (
          <div key={method} className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.02] flex items-center justify-center">
            <span className="text-[9px] font-extrabold text-zinc-400 tracking-wider">{method}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// ─── FAQ ───────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "When will paid plans be available?",
    a: "We're targeting public launch within the next few weeks. All beta users will receive an early-adopter discount of up to 40%.",
  },
  {
    q: "Will my data be preserved when I upgrade?",
    a: "Yes. All your historical data, automations, cost profiles, and settings carry over seamlessly.",
  },
  {
    q: "What payment methods will be accepted?",
    a: "UPI (GPay, PhonePe), Credit/Debit Cards, Net Banking, and major digital wallets via a secure payment gateway.",
  },
  {
    q: "Is GST included in plan prices?",
    a: "All listed prices are inclusive of 18% GST. Full tax invoices will be sent to your registered email.",
  },
];

function BillingFAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-5">
        <HelpCircle className="w-4 h-4 text-indigo-400" />
        <h3 className="text-base font-bold text-white">Frequently Asked Questions</h3>
      </div>
      <div className="flex flex-col divide-y divide-white/[0.05]">
        {FAQS.map((faq, i) => (
          <button
            key={i}
            onClick={() => setOpen(open === i ? null : i)}
            className="flex flex-col text-left py-3.5 gap-2 w-full group"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">
                {faq.q}
              </span>
              <span className={`text-zinc-600 transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}>
                ▾
              </span>
            </div>
            {open === i && (
              <p className="text-xs text-zinc-500 leading-relaxed pr-4">{faq.a}</p>
            )}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-8 pb-12">
      <PageHeader
        title="Billing & Subscriptions"
        description="Manage your plan, monitor usage, and review billing history."
        badge="Beta"
        action={
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-1.5">
            <Shield className="w-3 h-3 text-emerald-500" />
            Secure · GST Inclusive
          </div>
        }
      />

      {/* Current Plan + Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CurrentPlanCard />
        <UsageOverviewCard />
      </div>

      {/* Plan Cards */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-lg font-bold text-white">Available Plans</h2>
          <StatusBadge variant="coming-soon" label="Payment launching soon" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} isCurrent={plan.id === "free"} />
          ))}
        </div>
      </div>

      {/* Invoice + Payment + FAQ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 flex flex-col gap-5">
          <InvoiceHistory />
          <PaymentMethodCard />
        </div>
        <BillingFAQ />
      </div>
    </div>
  );
}
