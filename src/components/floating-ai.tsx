"use client";

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

export function FloatingAI() {
  const pathname = usePathname();

  // Hide the FAB if we're already on the AI chat page
  if (pathname === "/ai-chat") {
    return null;
  }

  return (
    <Link
      href="/ai-chat"
      className="md:hidden fixed bottom-20 right-4 z-50 flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-[#00c48c] to-[#00b07a] text-[#0d0e10] rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-transform"
      aria-label="Open AI Workspace"
    >
      <Sparkles className="w-6 h-6" />
    </Link>
  );
}
