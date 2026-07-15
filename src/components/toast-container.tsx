/**
 * SellerPlus OS — Toast Container Component
 * 
 * Renders stacked, animated toast notifications anchored to the bottom-right.
 * Uses Framer Motion for entrance/exit animations.
 * Place once in the root dashboard layout.
 */

"use client";

import React from "react";
import { useToastStore, type ToastVariant } from "@/hooks/use-toast-store";
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const VARIANT_CONFIG: Record<
  ToastVariant,
  { icon: React.ReactNode; border: string; bg: string; iconColor: string }
> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/[0.08]",
    iconColor: "text-emerald-400",
  },
  error: {
    icon: <XCircle className="w-4 h-4" />,
    border: "border-red-500/30",
    bg: "bg-red-500/[0.08]",
    iconColor: "text-red-400",
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    border: "border-amber-500/30",
    bg: "bg-amber-500/[0.08]",
    iconColor: "text-amber-400",
  },
  info: {
    icon: <Info className="w-4 h-4" />,
    border: "border-blue-500/30",
    bg: "bg-blue-500/[0.08]",
    iconColor: "text-blue-400",
  },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const config = VARIANT_CONFIG[toast.variant];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={`pointer-events-auto rounded-xl border ${config.border} ${config.bg} backdrop-blur-xl p-3.5 shadow-2xl shadow-black/40`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex-shrink-0 ${config.iconColor}`}>
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white leading-tight">
                    {toast.title}
                  </p>
                  {toast.message && (
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                      {toast.message}
                    </p>
                  )}
                  {toast.action && (
                    <button
                      onClick={toast.action.onClick}
                      className="mt-2 text-[11px] font-bold text-[#00c48c] hover:text-[#00e6a4] transition-colors"
                    >
                      {toast.action.label} →
                    </button>
                  )}
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="flex-shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
