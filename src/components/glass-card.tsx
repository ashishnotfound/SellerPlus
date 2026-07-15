"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hoverGlow?: boolean;
  delay?: number;
  variant?: "default" | "elevated" | "outlined" | "danger";
  loading?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

export function GlassCard({
  children,
  className,
  hoverGlow = true,
  delay = 0,
  variant = "default",
  loading = false,
  onClick,
}: GlassCardProps) {
  const variantClasses = {
    default: "glass-panel",
    elevated: "glass-panel bg-[#1c1e21]",
    outlined: "border border-white/10 bg-transparent",
    danger: "border border-rose-500/20 bg-[#1a1215]",
  };

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: delay }}
      className={cn(
        variantClasses[variant],
        "rounded-xl p-5 relative overflow-hidden",
        hoverGlow && "glass-panel-hover",
        className
      )}
    >
      {loading ? (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-4 w-2/5 rounded bg-white/[0.06]" />
          <div className="h-16 w-full rounded bg-white/[0.03]" />
          <div className="h-7 w-1/3 rounded bg-white/[0.06] mt-2" />
        </div>
      ) : (
        children
      )}
    </motion.div>
  );
}
