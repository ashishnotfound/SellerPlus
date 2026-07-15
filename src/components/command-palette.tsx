"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Cpu, CreditCard, LayoutDashboard, Search, Settings } from "lucide-react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const items = [
    {
      name: "Go to Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard className="w-4 h-4 text-zinc-400" />,
      category: "Navigation",
    },
    {
      name: "Run AI Listing Judge™",
      href: "/listing-judge",
      icon: <Bot className="w-4 h-4 text-zinc-400" />,
      category: "AI Tools",
    },
    {
      name: "Analyze Keywords (Gemini Keyword Engine™)",
      href: "/keyword-engine",
      icon: <Cpu className="w-4 h-4 text-zinc-400" />,
      category: "AI Tools",
    },
    {
      name: "Generate Copy (AI Copywriter)",
      href: "/copywriter",
      icon: <Cpu className="w-4 h-4 text-zinc-400" />, // Replaced with Cpu for search tools
      category: "AI Tools",
    },
    {
      name: "Manage Master SKUs",
      href: "/listings",
      icon: <Settings className="w-4 h-4 text-zinc-400" />,
      category: "Management",
    },
    {
      name: "Upgrade Subscription Plan",
      href: "/billing",
      icon: <CreditCard className="w-4 h-4 text-zinc-400" />,
      category: "Account",
    },
    {
      name: "Settings & Integrations",
      href: "/settings",
      icon: <Settings className="w-4 h-4 text-zinc-400" />,
      category: "Management",
    },
  ];

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (href: string) => {
    router.push(href);
    onClose();
    setQuery("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-xl bg-[#0A0A0C] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative z-10 mx-4"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 border-b border-white/5">
              <Search className="w-5 h-5 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search..."
                className="w-full h-12 bg-transparent border-0 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-0"
                autoFocus
              />
            </div>

            {/* Suggestions */}
            <div className="max-h-[300px] overflow-y-auto p-2 flex flex-col gap-1">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs">
                  No commands found matching "{query}"
                </div>
              ) : (
                filteredItems.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelect(item.href)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.04] text-left transition-colors text-zinc-300 hover:text-white"
                  >
                    <span className="flex items-center gap-3 text-sm">
                      {item.icon}
                      {item.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold font-mono">
                      {item.category}
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Console Footer */}
            <div className="px-4 py-2 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-600">
              <span>Use <kbd className="px-1 rounded border border-white/10">↑↓</kbd> to navigate</span>
              <span>Press <kbd className="px-1 rounded border border-white/10">Esc</kbd> to exit</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
