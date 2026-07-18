"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShoppingCart, Warehouse, Menu } from "lucide-react";
import { useMobileNav } from "@/hooks/use-mobile-nav";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Orders", href: "/orders", icon: ShoppingCart },
  { label: "Warehouse", href: "/warehouse", icon: Warehouse },
];

export function MobileNav() {
  const pathname = usePathname();
  const { setMobileDrawerOpen } = useMobileNav();

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0d0e10]/95 backdrop-blur-md border-t border-white/[0.08] pb-safe">
      <div className="flex items-center justify-around h-16 px-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors",
                isActive ? "text-[#00c48c]" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center justify-center gap-1 w-16 h-full text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </div>
  );
}
