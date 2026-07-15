"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    type: "up" | "down" | "neutral";
  };
  glowColor?: "indigo" | "emerald" | "rose" | "amber";
  delay?: number;
}

export function StatCard({
  title,
  value,
  subtext,
  icon,
  trend,
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="sb-card flex flex-col gap-3 cursor-default"
    >
      {/* Top row: label + green icon */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
          {title}
        </span>
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[#00c48c]/10 text-[#00c48c]">
          {icon}
        </div>
      </div>

      {/* Large value */}
      <span className="text-2xl font-bold tracking-tight text-white leading-none">
        {value}
      </span>

      {/* Footer row */}
      {(trend || subtext) && (
        <div className="flex items-center gap-2 pt-0.5 border-t border-white/5">
          {trend && (
            <span
              className={cn(
                "text-[10px] font-semibold flex items-center gap-0.5",
                trend.type === "up" && "text-[#00c48c]",
                trend.type === "down" && "text-rose-400",
                trend.type === "neutral" && "text-zinc-500"
              )}
            >
              {trend.type === "up" && <ArrowUpRight className="w-3 h-3" />}
              {trend.type === "down" && <ArrowDownRight className="w-3 h-3" />}
              {trend.value}
            </span>
          )}
          {subtext && (
            <span className="text-[10px] text-zinc-600">{subtext}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
