"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  label: string;
  used: number;
  total: number;
  unit?: string;
  color?: "indigo" | "emerald" | "amber" | "rose" | "sky";
  className?: string;
}

const COLOR_STYLES = {
  indigo: { bar: "bg-indigo-400", text: "text-indigo-400", warn: "bg-amber-400" },
  emerald: { bar: "bg-emerald-400", text: "text-emerald-400", warn: "bg-amber-400" },
  amber: { bar: "bg-amber-400", text: "text-amber-400", warn: "bg-rose-400" },
  rose: { bar: "bg-rose-400", text: "text-rose-400", warn: "bg-rose-600" },
  sky: { bar: "bg-sky-400", text: "text-sky-400", warn: "bg-amber-400" },
};

/**
 * Renders a usage progress bar with label, used/total counter, and warning at 85%.
 */
export function UsageMeter({ label, used, total, unit = "", color = "indigo", className }: UsageMeterProps) {
  const isUnlimited = total === -1;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / total) * 100));
  const isWarning = !isUnlimited && pct >= 85;
  const styles = COLOR_STYLES[color];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <span className={cn("text-xs font-bold tabular-nums", isWarning ? "text-amber-400" : "text-zinc-300")}>
          {isUnlimited ? (
            <span className="text-emerald-400 font-extrabold text-[10px] uppercase tracking-wider">Unlimited</span>
          ) : (
            <>
              <span className={styles.text}>{used.toLocaleString()}</span>
              <span className="text-zinc-600"> / {total.toLocaleString()}{unit && ` ${unit}`}</span>
            </>
          )}
        </span>
      </div>

      <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
        {!isUnlimited && (
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isWarning ? styles.warn : styles.bar
            )}
            style={{ width: `${pct}%` }}
          />
        )}
        {isUnlimited && <div className="h-full rounded-full bg-emerald-400/30 w-full" />}
      </div>

      {!isUnlimited && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-700">{pct}% used</span>
          {isWarning && (
            <span className="text-[10px] text-amber-500 font-bold">⚠ Approaching limit</span>
          )}
        </div>
      )}
    </div>
  );
}
