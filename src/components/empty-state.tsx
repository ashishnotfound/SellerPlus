"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function EmptyState({ icon, title, description, action, size = "md", className }: EmptyStateProps) {
  const sizeClasses = {
    sm: "py-10 px-6",
    md: "py-16 px-8",
    lg: "py-24 px-8",
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center border border-dashed border-white/[0.08] rounded-2xl bg-white/[0.01]",
        sizeClasses[size],
        className
      )}
    >
      <div className="text-zinc-600 mb-4 opacity-60 transition-opacity group-hover:opacity-80">
        {icon}
      </div>
      <h4 className="text-sm font-bold text-white mb-2">{title}</h4>
      <p className="text-xs text-zinc-500 max-w-[300px] leading-relaxed">{description}</p>
      {action && (
        action.href ? (
          <a
            href={action.href}
            className="mt-5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-400 to-emerald-400 text-black font-bold text-xs hover:opacity-90 transition-all hover:scale-[1.02] active:scale-100"
          >
            {action.label}
          </a>
        ) : (
          <button
            onClick={action.onClick}
            className="mt-5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-400 to-emerald-400 text-black font-bold text-xs hover:opacity-90 transition-all hover:scale-[1.02] active:scale-100"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
