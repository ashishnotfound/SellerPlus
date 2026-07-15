"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface SkeletonLoaderProps {
  variant?: "card" | "kpi" | "text" | "circle" | "table-row" | "page-header" | "billing-plan";
  lines?: number;
  count?: number;
  className?: string;
}

export function SkeletonLoader({ variant = "text", lines = 3, count = 1, className }: SkeletonLoaderProps) {

  if (variant === "kpi") {
    return (
      <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}>
        {Array.from({ length: count || 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 animate-pulse">
            <div className="h-3 bg-white/[0.06] rounded w-1/2 mb-4" />
            <div className="h-7 bg-white/[0.08] rounded w-3/4 mb-2" />
            <div className="h-2.5 bg-white/[0.04] rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "page-header") {
    return (
      <div className={cn("flex flex-col gap-2 animate-pulse", className)}>
        <div className="h-7 bg-white/[0.07] rounded-lg w-48" />
        <div className="h-3.5 bg-white/[0.04] rounded-lg w-80" />
      </div>
    );
  }

  if (variant === "billing-plan") {
    return (
      <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 animate-pulse flex flex-col gap-4">
            <div className="h-4 bg-white/[0.06] rounded w-2/3" />
            <div className="h-8 bg-white/[0.08] rounded w-1/2" />
            <div className="flex flex-col gap-2 mt-2">
              {[1, 2, 3].map(j => <div key={j} className="h-3 bg-white/[0.04] rounded" style={{ width: `${80 - j * 10}%` }} />)}
            </div>
            <div className="h-10 bg-white/[0.04] rounded-xl mt-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={cn("rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 animate-pulse", className)}>
        <div className="h-4 bg-white/[0.06] rounded-lg w-1/3 mb-4" />
        <div className="h-8 bg-white/[0.06] rounded-lg w-2/3 mb-3" />
        <div className="h-3 bg-white/[0.04] rounded-lg w-1/2" />
      </div>
    );
  }

  if (variant === "circle") {
    return (
      <div className={cn("flex flex-col items-center gap-3 animate-pulse", className)}>
        <div className="w-20 h-20 rounded-full bg-white/[0.06]" />
        <div className="h-3 bg-white/[0.04] rounded-lg w-20" />
      </div>
    );
  }

  if (variant === "table-row") {
    return (
      <div className={cn("flex flex-col gap-1.5 animate-pulse", className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-11 bg-white/[0.02] rounded-lg border border-white/[0.04] flex items-center gap-4 px-4">
            <div className="h-3 bg-white/[0.06] rounded w-1/5" />
            <div className="h-3 bg-white/[0.04] rounded w-1/4" />
            <div className="h-3 bg-white/[0.04] rounded w-1/6" />
            <div className="h-3 bg-white/[0.06] rounded w-1/5" />
            <div className="h-5 bg-white/[0.04] rounded-full w-14 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  // Default: text skeleton
  return (
    <div className={cn("flex flex-col gap-2.5 animate-pulse", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3.5 bg-white/[0.06] rounded-lg"
          style={{ width: `${Math.max(40, 100 - i * 15)}%` }}
        />
      ))}
    </div>
  );
}
