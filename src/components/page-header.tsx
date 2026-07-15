"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable page header — consistent across all dashboard pages.
 * Replaces ad-hoc <h1> + <p> patterns with a single composable component.
 */
interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, badge, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
          {badge && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-zinc-500 leading-relaxed max-w-2xl">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
