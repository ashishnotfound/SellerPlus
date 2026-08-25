"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Info, MonitorCog, RefreshCw, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass-card";

interface AboutData {
  product: string;
  developer: string;
  version: string;
  build: string;
  environment: string;
  updateChannel: string;
  worker: {
    version: string;
    platform: string;
    status: string;
    last_seen_at: string | null;
  } | null;
  links: {
    privacy: string | null;
    terms: string | null;
    support: string | null;
  };
}

export function AboutSellerPlus() {
  const [data, setData] = useState<AboutData | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/about", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active && payload?.data) setData(payload.data);
      });
    return () => { active = false; };
  }, []);

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="border-b border-white/5 bg-gradient-to-r from-indigo-500/10 via-transparent to-transparent p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-2.5">
            <Info className="h-5 w-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">SellerPlus</h2>
            <p className="mt-0.5 text-xs font-semibold text-indigo-300">Made by ReyoStudio</p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
              AI-first seller operating system for secure marketplace operations, analytics, and controlled automation.
            </p>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-white/5">
        {[
          ["Application version", data?.version ?? "Loading…"],
          ["Build identifier", data?.build ?? "Loading…"],
          ["Update channel", data?.updateChannel ?? "Loading…"],
          ["Environment", data?.environment ?? "Loading…"],
        ].map(([label, value]) => (
          <div key={label} className="bg-[#0e0e12] px-4 py-3">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">{label}</dt>
            <dd className="mt-1 truncate font-mono text-xs text-zinc-300">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-xs">
          <MonitorCog className="h-4 w-4 text-zinc-500" />
          <span className="text-zinc-500">Desktop worker</span>
          <span className="ml-auto font-mono text-zinc-300">
            {data?.worker ? `${data.worker.version} · ${data.worker.status}` : "Not connected"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <RefreshCw className="h-4 w-4 text-zinc-500" />
          <span className="text-zinc-500">Updates</span>
          <span className="ml-auto text-zinc-300">Managed by deployment channel</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span className="text-zinc-500">Developer</span>
          <span className="ml-auto font-semibold text-zinc-200">ReyoStudio</span>
        </div>
      </div>

      {data && Object.values(data.links).some(Boolean) && (
        <div className="flex flex-wrap gap-3 border-t border-white/5 px-5 py-3 text-[11px] text-zinc-500">
          {Object.entries(data.links).map(([label, href]) => href && (
            <a key={label} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1 capitalize hover:text-zinc-200">
              {label}<ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
