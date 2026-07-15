"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { useConnections } from "@/hooks/use-connections";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastContainer } from "@/components/toast-container";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useAnalyticsStore } from "@/hooks/use-analytics-store";
import { useListingsStore } from "@/hooks/use-listings-store";
import { useGoalsStore } from "@/hooks/use-goals-store";
import { useToastStore } from "@/hooks/use-toast-store";
import { AlertTriangle } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const checkSession = useAuth((s) => s.checkSession);
  const logout = useAuth((s) => s.logout);
  const stopImpersonation = useAuth((s) => s.stopImpersonation);
  const loadSubscription = useSubscription((s) => s.loadSubscription);
  const loadConnections = useConnections((s) => s.loadConnections);
  const amazonConnected = useConnections((s) => s.amazonConnected);
  const loadAnalyticsData = useAnalyticsStore((s) => s.loadAnalyticsData);
  const loadListings = useListingsStore((s) => s.loadListings);
  const loadGoals = useGoalsStore((s) => s.loadGoals);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSandbox, setIsSandbox] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSandbox(localStorage.getItem("sp_amazon_sandbox") === "true");
    }
  }, [amazonConnected]);

  useEffect(() => {
    checkSession();
    loadSubscription();
    loadConnections();
  }, [checkSession, loadSubscription, loadConnections]);

  useEffect(() => {
    if (user?.id) {
      loadAnalyticsData(user.id);
      loadListings(user.id);
      loadGoals(user.id);
    }
  }, [user?.id, loadAnalyticsData, loadListings, loadGoals]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  // Warehouse role redirect — restricted roles are gated to /warehouse
  // Server-side RBAC still enforces this; this is a UX convenience only.
  useEffect(() => {
    if (!loading && user) {
      const RESTRICTED = ["warehouse", "packer", "shipping"];
      if (RESTRICTED.includes(user.role) && typeof window !== "undefined") {
        const path = window.location.pathname;
        // Allow /warehouse and /auth paths; redirect everything else
        if (!path.startsWith("/warehouse") && !path.startsWith("/auth")) {
          router.replace("/warehouse");
        }
      }
    }
  }, [user, loading, router]);

  useKeyboardShortcut("k", () => setIsSearchOpen((prev) => !prev));

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#0d0e10] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-t-2 border-[#00c48c] border-solid rounded-full animate-spin" />
          <span className="text-zinc-600 text-[11px] font-semibold tracking-wider uppercase">
            Loading workspace...
          </span>
        </div>
      </div>
    );
  }

  // Account suspension block gate
  if (user.isSuspended) {
    return (
      <div className="min-h-screen bg-[#0d0e10] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-center shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Account Access Suspended</h2>
          <p className="text-xs text-zinc-400 leading-relaxed mb-6">
            Your access credentials to the SellerPlus OS dashboard have been suspended by the administrator. 
            If you believe this is a mistake or need to settle your subscriptions, contact billing support.
          </p>
          <button 
            onClick={logout}
            className="h-10 px-6 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors"
          >
            Sign Out Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0d0e10]">
      {/* Sidebar */}
      <Sidebar
        userEmail={user.email}
        userRole={user.role}
        onLogout={logout}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-y-auto max-h-screen">
        {/* Mobile top spacer — clears the hamburger button */}
        <div className="h-14 md:hidden shrink-0" />
        {/* Impersonation Banner */}
        {user.impersonatingUserId && (
          <div className="w-full bg-purple-600 text-white px-5 py-2.5 text-xs font-bold flex items-center justify-between shrink-0 select-none shadow-md">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              <span>👁️ IMPERSONATION ACTIVE: Mapped context to target owner account <strong className="underline font-mono">{user.email}</strong></span>
            </div>
            <button 
              onClick={() => {
                stopImpersonation();
                useToastStore.getState().success("Session Restored", "Returned to administrator session context.");
              }}
              className="px-2.5 py-1 rounded bg-white text-purple-700 hover:bg-zinc-100 font-bold transition-all text-[10px]"
            >
              Exit Impersonation Mode
            </button>
          </div>
        )}

        <div className="p-7 max-w-7xl mx-auto flex flex-col gap-5 w-full flex-1">
          {/* Sandbox sync banner */}
          {amazonConnected && isSandbox && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-[#00c48c]/15 bg-[#00c48c]/[0.04] text-xs text-[#00c48c]/80">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00c48c] animate-pulse" />
                <span>
                  <strong className="text-[#00c48c]">Sandbox Sync Active</strong>
                  {" "}— High-fidelity mock metrics populated in your Supabase tables.
                </span>
              </div>
              <span className="text-[10px] text-[#00c48c]/50 uppercase tracking-wider font-bold">
                Simulated 100%
              </span>
            </div>
          )}

          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>

      {/* Command Palette */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}
