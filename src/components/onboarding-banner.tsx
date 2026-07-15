"use client";

import React from "react";
import Link from "next/link";
import {
  Plug,
  ArrowRight,
  Database,
  DollarSign,
  Bot,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  cta: string;
  done?: boolean;
}

interface OnboardingBannerProps {
  steps?: {
    amazonConnected: boolean;
    costProfileAdded: boolean;
    aiChatUsed: boolean;
  };
}

const DEFAULT_STEPS: Step[] = [
  {
    id: "connect",
    title: "Connect Amazon Account",
    description: "Link your SP-API credentials to import real orders, campaigns, and listings.",
    icon: <Plug className="w-5 h-5" />,
    href: "/settings",
    cta: "Connect Now",
  },
  {
    id: "costs",
    title: "Add Cost Profiles",
    description: "Add COGS and fees for each product so the AI can calculate real profitability.",
    icon: <DollarSign className="w-5 h-5" />,
    href: "/costs",
    cta: "Add Costs",
  },
  {
    id: "ai",
    title: "Run Your First AI Audit",
    description: "Ask the AI to audit your store and surface your highest-impact opportunities.",
    icon: <Bot className="w-5 h-5" />,
    href: "/ai-chat",
    cta: "Open AI Workspace",
  },
];

export function OnboardingBanner({ steps }: OnboardingBannerProps) {
  const enrichedSteps: Step[] = DEFAULT_STEPS.map((step) => ({
    ...step,
    done:
      step.id === "connect"
        ? steps?.amazonConnected
        : step.id === "costs"
        ? steps?.costProfileAdded
        : step.id === "ai"
        ? steps?.aiChatUsed
        : false,
  }));

  const completedCount = enrichedSteps.filter((s) => s.done).length;
  const allDone = completedCount === enrichedSteps.length;

  if (allDone) return null;

  return (
    <GlassCard className="relative overflow-hidden border-indigo-500/10 bg-indigo-500/[0.01]">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.6), transparent 60%)",
        }}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-5 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Get Started with SellerPlus</h3>
            </div>
            <p className="text-xs text-zinc-500">
              Complete these steps to unlock the full power of the AI Business Consultant.
            </p>
          </div>
          {/* Progress pill */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
            <span className="text-xs font-bold text-white tabular-nums">
              {completedCount}/{enrichedSteps.length}
            </span>
            <span className="text-[10px] text-zinc-500">done</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/[0.05] rounded-full mb-5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-400 to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${(completedCount / enrichedSteps.length) * 100}%` }}
          />
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {enrichedSteps.map((step, i) => (
            <div
              key={step.id}
              className={`relative flex flex-col gap-2.5 rounded-xl p-4 border transition-all ${
                step.done
                  ? "border-emerald-500/15 bg-emerald-500/[0.03]"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10]"
              }`}
            >
              {/* Step number + icon */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    step.done
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-white/[0.04] border border-white/[0.08] text-zinc-500"
                  }`}
                >
                  {step.done ? <CheckCircle2 className="w-4 h-4" /> : step.icon}
                </div>
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wider ${
                    step.done ? "text-emerald-500" : "text-zinc-700"
                  }`}
                >
                  Step {i + 1}
                </span>
              </div>

              <div>
                <p className={`text-xs font-bold mb-0.5 ${step.done ? "text-zinc-400 line-through" : "text-white"}`}>
                  {step.title}
                </p>
                <p className="text-[11px] text-zinc-600 leading-relaxed">{step.description}</p>
              </div>

              {!step.done && (
                <Link
                  href={step.href}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors mt-auto"
                >
                  {step.cta}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
