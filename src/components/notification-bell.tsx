"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bell, AlertTriangle, CheckCircle, Package, TrendingDown, RefreshCw } from "lucide-react";
import { useAnalyticsStore } from "@/hooks/use-analytics-store";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const alerts = useAnalyticsStore((s) => s.alerts);
  const unreadAlertCount = useAnalyticsStore((s) => s.unreadAlertCount);
  const markAlertsAsRead = useAnalyticsStore((s) => s.markAlertsAsRead);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "low_stock":
      case "out_of_stock_risk":
        return <Package className="w-4 h-4 text-rose-400" />;
      case "sales_drop":
      case "profit_decrease":
        return <TrendingDown className="w-4 h-4 text-amber-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-indigo-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-1.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/5 text-zinc-400 hover:text-white transition-all duration-200"
      >
        <Bell className="w-4 h-4" />
        {unreadAlertCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-[9px] font-black text-white flex items-center justify-center border border-[#0A0A0C] animate-pulse">
            {unreadAlertCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2.5 w-72 rounded-xl border border-white/10 bg-[#0E0E12] p-4 shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              Notifications
              {unreadAlertCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-[9px] text-rose-400 font-extrabold leading-none">
                  {unreadAlertCount} New
                </span>
              )}
            </span>
            {unreadAlertCount > 0 && (
              <button
                onClick={() => {
                  markAlertsAsRead();
                  setIsOpen(false);
                }}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
              >
                <CheckCircle className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="py-6 text-center text-[10px] text-zinc-500">
                No active notifications found.
              </div>
            ) : (
              alerts.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "p-2.5 rounded-lg border text-[11px] leading-relaxed transition-all",
                    a.isRead
                      ? "bg-transparent border-white/5 text-zinc-500"
                      : "bg-white/[0.01] border-white/10 text-zinc-300 font-medium"
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {getAlertIcon(a.type)}
                    <span className="font-bold text-white truncate block">{a.title}</span>
                  </div>
                  <p>{a.message}</p>
                  <span className="text-[9px] text-zinc-600 block mt-1.5">
                    {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
