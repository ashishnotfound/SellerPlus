"use client";

import React, { useState, useEffect, useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import { useToastStore } from "@/hooks/use-toast-store";
import { useAuth } from "@/hooks/use-auth";
import { 
  AlertTriangle, RefreshCw, ClipboardList, ShieldAlert, ShieldCheck, Info
} from "lucide-react";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface AlertRecord {
  id: string;
  sku: string;
  asin: string;
  alert_type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  reason: string;
  recommended_action: string;
  resolved: boolean;
  created_at: string;
  data_source: string;
  source_updated_at: string | null;
}

interface ConnectionRecord {
  id: string;
  provider: string;
  marketplace_name: string;
  marketplace_id: string;
  status: string;
  capabilities: string[];
  updated_at: string;
}

export default function OperationsAlertsPage() {
  const user = useAuth((s) => s.user);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanSummary, setScanSummary] = useState<{ scannedListings: number; staleListingsExcluded: number } | null>(null);

  const loadAlerts = async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await sellerplusApiFetch("/api/alerts");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Operational alerts are unavailable.");
      setAlerts(payload.data ?? []);
      setConnections(payload.connections ?? []);
    } catch (caught) {
      setAlerts([]);
      setConnections([]);
      setLoadError(caught instanceof Error ? caught.message : "Operational alerts are unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [user?.id, user?.workspaceId]);

  const handleRunDiagnostics = async () => {
    if (!user?.id) return;
    setIsScanning(true);
    try {
      const res = await sellerplusApiFetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ lowStockThreshold: 10 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Diagnostics could not run.");
      setScanSummary(data.data ?? null);
      await loadAlerts();
      useToastStore.getState().success("Scan complete", `${data.data.alertsCreated} source-qualified inventory alerts are active.`);
    } catch (caught) {
      useToastStore.getState().error("Scan failed", caught instanceof Error ? caught.message : "Try again later.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleResolveAlert = async (id: string) => {
    try {
      const response = await sellerplusApiFetch("/api/alerts", {
        method: "PATCH",
        body: JSON.stringify({ alertId: id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Alert could not be resolved.");
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (caught) {
      useToastStore.getState().error("Archive failed", caught instanceof Error ? caught.message : "Try again later.");
    }
  };

  // Grouped breakdown
  const criticalAlerts = useMemo(() => alerts.filter(a => a.severity === "CRITICAL"), [alerts]);
  const warningAlerts = useMemo(() => alerts.filter(a => a.severity === "WARNING"), [alerts]);

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-rose-400" />
            Operational Alerts Console
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Inventory diagnostics derived from recent Amazon listing reports, with source freshness shown for every alert.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunDiagnostics}
            disabled={isScanning}
            className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs transition-all flex items-center gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isScanning && "animate-spin")} />
            Run Diagnostics Scan
          </button>
        </div>
      </div>

      {loadError ? (
        <GlassCard className="p-8 flex flex-col items-center text-center">
          <AlertTriangle className="w-7 h-7 text-amber-400 mb-3" />
          <p className="text-sm text-zinc-300">{loadError}</p>
        </GlassCard>
      ) : loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2">
          <div className="w-6 h-6 border-t-2 border-rose-500 border-solid rounded-full animate-spin" />
          <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Evaluating operational constraints...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Warnings Ledger */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            
            {alerts.length === 0 ? (
              <GlassCard className="p-8 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-[#00c48c] mb-4">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">No active inventory alerts</h3>
                <p className="text-xs text-zinc-500 max-w-[340px] leading-relaxed mb-4">
                  No low-stock or out-of-stock conditions were found in the most recent qualified scan. This does not imply account-health, Buy Box, or policy status.
                </p>
                <button
                  onClick={handleRunDiagnostics}
                  className="px-3.5 h-8 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-zinc-300 text-xs font-bold transition-all"
                >
                  Verify Now
                </button>
              </GlassCard>
            ) : (
              <>
                {/* Critical Issues */}
                {criticalAlerts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-rose-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Critical Incidents ({criticalAlerts.length})
                    </span>
                    <div className="flex flex-col gap-2.5">
                      {criticalAlerts.map((a) => (
                        <div key={a.id} className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                {a.alert_type}
                              </span>
                              <span className="font-mono text-zinc-500 text-[10px]">SKU: {a.sku}</span>
                            </div>
                            <p className="text-white text-[11px] font-bold mt-1.5 leading-snug">{a.reason}</p>
                            <p className="text-zinc-400 text-3xs mt-1">Recommended Action: {a.recommended_action}</p>
                            <p className="text-zinc-600 text-[9px] mt-1">Source: {a.data_source} · Updated {a.source_updated_at ? new Date(a.source_updated_at).toLocaleString() : "unknown"}</p>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <Link href="/analytics/inventory" className="h-8 px-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1 transition-all">
                              <ClipboardList className="w-3.5 h-3.5" /> Review Inventory
                            </Link>
                            <button
                              onClick={() => handleResolveAlert(a.id)}
                              className="h-8 w-8 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white"
                              title="Archive warning"
                            >
                              ✓
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {warningAlerts.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4">
                    <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Warnings & Vulnerabilities ({warningAlerts.length})
                    </span>
                    <div className="flex flex-col gap-2.5">
                      {warningAlerts.map((a) => (
                        <div key={a.id} className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {a.alert_type}
                              </span>
                              <span className="font-mono text-zinc-500 text-[10px]">SKU: {a.sku}</span>
                            </div>
                            <p className="text-white text-[11px] font-bold mt-1.5 leading-snug">{a.reason}</p>
                            <p className="text-zinc-400 text-3xs mt-1">Recommended Action: {a.recommended_action}</p>
                            <p className="text-zinc-600 text-[9px] mt-1">Source: {a.data_source} · Updated {a.source_updated_at ? new Date(a.source_updated_at).toLocaleString() : "unknown"}</p>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <Link href="/analytics/inventory" className="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs flex items-center gap-1 transition-all">
                              <ClipboardList className="w-3.5 h-3.5" /> Restock
                            </Link>
                            <button
                              onClick={() => handleResolveAlert(a.id)}
                              className="h-8 w-8 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white"
                            >
                              ✓
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

          </div>

          {/* Sync Diagnostics Dashboard Sidebar */}
          <div className="flex flex-col gap-4">
            <GlassCard className="p-5 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Info className="w-4 h-4 text-indigo-400" /> Connected Data Sources
              </h3>
              
              <div className="flex flex-col gap-3 font-medium">
                {connections.length === 0 ? (
                  <div className="p-3 rounded-xl border border-white/5 bg-white/[0.01] text-xs text-zinc-500">
                    No marketplace account is connected. Configure Amazon in Settings before scanning.
                  </div>
                ) : connections.map((connection) => (
                  <div key={connection.id} className="p-3 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-white block">{connection.marketplace_name || connection.marketplace_id}</span>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">{connection.capabilities.join(", ") || "No API capabilities recorded"}</span>
                    </div>
                    <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border", connection.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20")}>
                      {connection.status}
                    </span>
                  </div>
                ))}
                {scanSummary && (
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Last scan evaluated {scanSummary.scannedListings} fresh Amazon listings and excluded {scanSummary.staleListingsExcluded} stale records.
                  </p>
                )}
              </div>
            </GlassCard>
          </div>

        </div>
      )}
    </div>
  );
}
