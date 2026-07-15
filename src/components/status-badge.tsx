"use client";

import React from "react";
import { cn } from "@/lib/utils";

type StatusVariant =
  | "active"
  | "inactive"
  | "pending"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "draft"
  | "beta"
  | "coming-soon"
  | "new"
  | "live";

const VARIANT_STYLES: Record<StatusVariant, string> = {
  active:       "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  inactive:     "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  pending:      "bg-amber-500/10 text-amber-400 border-amber-500/20",
  success:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  error:        "bg-rose-500/10 text-rose-400 border-rose-500/20",
  warning:      "bg-amber-500/10 text-amber-400 border-amber-500/20",
  info:         "bg-sky-500/10 text-sky-400 border-sky-500/20",
  draft:        "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  beta:         "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "coming-soon":"bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  new:          "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  live:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  dot?: boolean;
  className?: string;
}

/**
 * Reusable status badge — replaces all inline `<span className="px-2 bg-emerald...">` patterns.
 */
export function StatusBadge({ variant, label, dot = false, className }: StatusBadgeProps) {
  const displayLabel = label ?? variant.replace("-", " ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border",
        VARIANT_STYLES[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            variant === "active" || variant === "live" || variant === "success"
              ? "bg-emerald-400 animate-pulse"
              : variant === "pending" || variant === "warning"
              ? "bg-amber-400"
              : variant === "error"
              ? "bg-rose-400"
              : "bg-current"
          )}
        />
      )}
      {displayLabel}
    </span>
  );
}
