"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { GlassCard } from "@/components/glass-card";
import { useToastStore } from "@/hooks/use-toast-store";
import { 
  ShieldAlert, 
  Users, 
  Layers, 
  CreditCard, 
  UserX, 
  Search, 
  UserCheck, 
  Lock, 
  History,
  CheckCircle,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MerchantProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_super_admin: boolean;
  is_suspended: boolean;
  created_at: string;
  workspaceName?: string;
  workspaceRole?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
}

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  timestamp: string;
  email: string;
}

export default function AdminSuperPanel() {
  const user = useAuth((s) => s.user);
  
  const [merchants, setMerchants] = useState<MerchantProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Statistics
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalWorkspaces: 0,
    activePaidSubs: 0,
    suspendedCount: 0
  });

  const fetchGlobalData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load admin data.");

      setMerchants(payload.data.merchants);
      setStats(payload.data.stats);
      setAuditLogs(payload.data.auditLogs);
    } catch (error) {
      useToastStore.getState().error(
        "Admin data unavailable",
        error instanceof Error ? error.message : "Unable to load admin data.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.isSuperAdmin) {
      fetchGlobalData();
    }
  }, [user?.isSuperAdmin]);

  const handleToggleSuspension = async (merchantId: string, currentSuspended: boolean) => {
    try {
      const response = await fetch(`/api/admin/users/${merchantId}/suspension`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suspended: !currentSuspended }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update this account.");

      useToastStore.getState().success(
        "Status updated",
        currentSuspended ? "Account access restored." : "Account access suspended.",
      );
      await fetchGlobalData();
    } catch (error) {
      useToastStore.getState().error(
        "Action failed",
        error instanceof Error ? error.message : "Unable to update this account.",
      );
    }
  };

  // Restrict view to super-admin
  if (!user || !user.isSuperAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[#0E0E12] p-6 text-center shadow-xl">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <Lock className="w-5 h-5 text-rose-400" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Access Restriced: 403 Forbidden</h2>
          <p className="text-xs text-zinc-400 leading-relaxed mb-4">
            The Admin Super-Panel is restricted strictly to root system administrators. Your account role does not have permission to view global data ledger systems.
          </p>
        </div>
      </div>
    );
  }

  const filteredMerchants = merchants.filter(m => 
    m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.full_name && m.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    m.workspaceName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
          <ShieldAlert className="w-6 h-6 text-[#00c48c]" />
          Super-Admin Console
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          Monitor subscriptions billing metrics, toggle user access accounts, or audit system activity logs.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400">
            <Users className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Total Users</span>
            <span className="text-xl font-extrabold text-white mt-0.5">{stats.totalUsers}</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#00c48c]/10 flex items-center justify-center border border-[#00c48c]/20 text-[#00c48c]">
            <Layers className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Total Tenants</span>
            <span className="text-xl font-extrabold text-white mt-0.5">{stats.totalWorkspaces}</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Paid Subscriptions</span>
            <span className="text-xl font-extrabold text-white mt-0.5">{stats.activePaidSubs}</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-400">
            <UserX className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Suspended Accounts</span>
            <span className="text-xl font-extrabold text-white mt-0.5">{stats.suspendedCount}</span>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left 3 cols: Merchants Management Table */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <GlassCard className="p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-bold text-white uppercase tracking-wider">Registered Merchants</h3>
              {/* Search */}
              <div className="w-64 h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter by name, email, workspace..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
              </div>
            </div>

            {loading ? (
              <div className="h-48 flex items-center justify-center">
                <div className="w-6 h-6 border-t-2 border-[#00c48c] border-solid rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead>
                    <tr className="border-b border-white/5 text-zinc-500 font-semibold h-9 uppercase tracking-wider text-[9px]">
                      <th>Merchant</th>
                      <th>Workspace / Role</th>
                      <th>Tier</th>
                      <th>Registered</th>
                      <th>Status</th>
                      <th className="text-right">Admin Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium">
                    {filteredMerchants.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="h-24 text-center text-zinc-500">No matching merchants found.</td>
                      </tr>
                    ) : (
                      filteredMerchants.map((m) => (
                        <tr key={m.id} className="h-14 hover:bg-white/[0.01] transition-colors">
                          <td className="pr-4">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-zinc-400">
                                {(m.full_name?.[0] || m.email[0]).toUpperCase()}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-white truncate">{m.full_name || "New Merchant"}</span>
                                <span className="text-[10px] text-zinc-500 truncate font-mono">{m.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-col">
                              <span className="text-zinc-300 font-medium">{m.workspaceName}</span>
                              <span className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5">{m.workspaceRole}</span>
                            </div>
                          </td>
                          <td>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold border uppercase font-sans",
                              m.subscriptionPlan === "free"
                                ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                                : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            )}>
                              {m.subscriptionPlan}
                            </span>
                          </td>
                          <td className="text-zinc-500 font-mono text-[10px]">{new Date(m.created_at).toLocaleDateString()}</td>
                          <td>
                            {m.is_suspended ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase">
                                Suspended
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                                Active
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleToggleSuspension(m.id, m.is_suspended)}
                                className={cn(
                                  "h-8 px-2.5 rounded-lg font-bold text-[10px] uppercase border transition-all flex items-center gap-1",
                                  m.is_suspended
                                    ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
                                    : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20"
                                )}
                              >
                                {m.is_suspended ? (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5" /> Unsuspend
                                  </>
                                ) : (
                                  <>
                                    <UserX className="w-3.5 h-3.5" /> Suspend
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right 1 col: Audit Logs Ledger */}
        <div className="flex flex-col gap-6">
          <GlassCard className="p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <History className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">System Audit Trail</h3>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Consolidated real-time operational logs showing system events and gateway interactions.
            </p>

            <div className="flex flex-col gap-3 mt-2">
              {auditLogs.map((log) => (
                <div 
                  key={log.id} 
                  className="p-3 rounded-xl border border-white/5 bg-white/[0.01] flex flex-col gap-1 text-[10px] leading-relaxed"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#00c48c] font-mono">{log.action}</span>
                    <span className="text-[9px] text-zinc-600 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className="text-zinc-400">Target: {log.entity}</span>
                  <span className="text-zinc-500 truncate font-mono">Actor: {log.email}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">RBAC Security Notice</h3>
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Administrative actions are performed by authenticated server endpoints, permission checked, and recorded in the audit trail. Seller sessions are never impersonated in the browser.
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
